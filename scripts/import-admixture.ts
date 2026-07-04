import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import pg from "pg";
import { colorForComponent } from "../src/lib/admixture/colors";

const { Pool } = pg;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = new Map<string, string | boolean>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        parsed.set(key, true);
      } else {
        parsed.set(key, next);
        i += 1;
      }
    }
  }

  const qFile = parsed.get("q");
  const idsFile = parsed.get("ids");
  const k = Number(parsed.get("k"));

  if (!qFile || !idsFile || !Number.isInteger(k) || k <= 0) {
    throw new Error("Usage: npm run import:admixture -- --q run.K5.Q --ids sample_ids.txt --k 5 --release v66.2M.aadr.PUB --name RunName");
  }

  return {
    qFile: resolve(String(qFile)),
    idsFile: resolve(String(idsFile)),
    k,
    release: parsed.get("release") ? String(parsed.get("release")) : null,
    name: parsed.get("name") ? String(parsed.get("name")) : basename(String(qFile)),
    replace: parsed.get("replace") === true || parsed.get("replace") === "true"
  };
}

function parseQMatrix(text: string, k: number) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const values = line.split(/\s+/).map(Number);
      if (values.length !== k || values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Q matrix line ${index + 1} does not have ${k} numeric components.`);
      }
      return values;
    });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const args = parseArgs();
  const [qText, idsText] = await Promise.all([readFile(args.qFile, "utf8"), readFile(args.idsFile, "utf8")]);
  const qRows = parseQMatrix(qText, args.k);
  const geneticIds = idsText
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);

  if (qRows.length !== geneticIds.length) {
    throw new Error(`Q matrix has ${qRows.length} rows but ID file has ${geneticIds.length} IDs.`);
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const releaseResult = args.release
      ? await client.query("SELECT id FROM aadr_releases WHERE name = $1", [args.release])
      : await client.query("SELECT id FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1");

    if (!releaseResult.rowCount) {
      throw new Error(args.release ? `Release '${args.release}' was not found.` : "No AADR release has been imported.");
    }

    const releaseId = releaseResult.rows[0].id;
    const existing = await client.query("SELECT id FROM admixture_runs WHERE release_id = $1 AND name = $2 AND k = $3", [
      releaseId,
      args.name,
      args.k
    ]);

    if (existing.rowCount && !args.replace) {
      throw new Error(`ADMIXTURE run '${args.name}' K=${args.k} already exists. Re-run with --replace.`);
    }
    if (existing.rowCount && args.replace) {
      await client.query("DELETE FROM admixture_runs WHERE id = $1", [existing.rows[0].id]);
    }

    const run = await client.query(
      "INSERT INTO admixture_runs (release_id, name, k, source_metadata) VALUES ($1, $2, $3, $4) RETURNING id",
      [
        releaseId,
        args.name,
        args.k,
        JSON.stringify({
          qFile: args.qFile,
          idsFile: args.idsFile,
          explicitSampleMapping: true
        })
      ]
    );
    const runId = run.rows[0].id;

    for (let component = 1; component <= args.k; component += 1) {
      await client.query(
        "INSERT INTO admixture_components (run_id, component_index, color_hex) VALUES ($1, $2, $3)",
        [runId, component, colorForComponent(component)]
      );
    }

    const sampleLookup = await client.query(
      "SELECT id, genetic_id FROM samples WHERE release_id = $1 AND genetic_id = ANY($2)",
      [releaseId, geneticIds]
    );
    const sampleIdByGeneticId = new Map(sampleLookup.rows.map((row) => [row.genetic_id, row.id]));
    const missing = geneticIds.filter((geneticId) => !sampleIdByGeneticId.has(geneticId));
    if (missing.length) {
      throw new Error(`ADMIXTURE ID file contains ${missing.length} IDs not present in samples. First missing ID: ${missing[0]}`);
    }

    for (let rowIndex = 0; rowIndex < qRows.length; rowIndex += 1) {
      const sampleId = sampleIdByGeneticId.get(geneticIds[rowIndex]);
      const values = qRows[rowIndex];
      for (let component = 1; component <= args.k; component += 1) {
        await client.query(
          "INSERT INTO admixture_values (run_id, sample_id, component_index, fraction) VALUES ($1, $2, $3, $4)",
          [runId, sampleId, component, values[component - 1]]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Imported ADMIXTURE run '${args.name}' K=${args.k} for ${qRows.length} samples.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
