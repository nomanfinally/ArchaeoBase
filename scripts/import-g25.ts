import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { G25_DIMENSION_COUNT, parseG25CsvRows } from "../src/lib/g25";

const { Pool } = pg;

type Args = {
  file: string;
  release?: string;
  source: string | null;
  replace: boolean;
  allowMissing: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      parsed.set(key, next);
      index += 1;
    }
  }

  const file = String(parsed.get("file") ?? process.env.G25_COORDS_PATH ?? "");
  if (!file) {
    throw new Error("Usage: npm run import:g25 -- --file imports/g25.csv [--release v66.2M.aadr.PUB] [--source label] [--replace] [--allow-missing]");
  }

  return {
    file,
    release: parsed.get("release") ? String(parsed.get("release")) : undefined,
    source: parsed.get("source") ? String(parsed.get("source")) : null,
    replace: parsed.get("replace") === true || parsed.get("replace") === "true",
    allowMissing: parsed.get("allow-missing") === true || parsed.get("allow-missing") === "true"
  };
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function coordinateColumnNames() {
  return Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => `coord_${index + 1}`);
}

function coordinatePlaceholders(startIndex: number) {
  return Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => `$${startIndex + index}`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const args = parseArgs();
  const sourceFile = resolve(args.file);
  const text = await readFile(sourceFile, "utf8");
  const parsedRows = parseG25CsvRows(text, args.source);
  if (!parsedRows.length) throw new Error(`No G25 rows found in ${sourceFile}.`);

  const pool = new Pool({ connectionString, options: "-c jit=off" });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const releaseResult = await client.query<{ id: string; name: string }>(
      args.release
        ? "SELECT id, name FROM aadr_releases WHERE name = $1"
        : "SELECT id, name FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1",
      args.release ? [args.release] : []
    );
    const release = releaseResult.rows[0];
    if (!release) {
      throw new Error(args.release ? `Release '${args.release}' was not found.` : "No AADR release has been imported.");
    }

    const geneticIds = uniqueValues(parsedRows.map((row) => row.geneticId));
    const samples = await client.query<{ id: string; genetic_id: string }>(
      `
        SELECT id, genetic_id
        FROM samples
        WHERE release_id = $1 AND genetic_id = ANY($2)
      `,
      [release.id, geneticIds]
    );
    const sampleByGeneticId = new Map(samples.rows.map((row) => [row.genetic_id, row.id]));
    const missing = geneticIds.filter((geneticId) => !sampleByGeneticId.has(geneticId));
    if (missing.length && !args.allowMissing) {
      throw new Error(`G25 sheet contains ${missing.length} IDs not present in samples. First missing ID: ${missing[0]}`);
    }

    if (args.replace) {
      await client.query("DELETE FROM g25_coordinates WHERE release_id = $1", [release.id]);
    }

    const coordinateColumns = coordinateColumnNames();
    const columns = [
      "release_id",
      "sample_id",
      "genetic_id",
      "coords_name",
      "source",
      ...coordinateColumns
    ];
    const updateColumns = [
      "genetic_id = EXCLUDED.genetic_id",
      "coords_name = EXCLUDED.coords_name",
      "source = EXCLUDED.source",
      ...coordinateColumns.map((column) => `${column} = EXCLUDED.${column}`),
      "imported_at = now()"
    ];

    let inserted = 0;
    let skipped = 0;
    for (const row of parsedRows) {
      const sampleId = sampleByGeneticId.get(row.geneticId);
      if (!sampleId) {
        skipped += 1;
        continue;
      }

      const params = [
        release.id,
        sampleId,
        row.geneticId,
        row.coordsName,
        row.source,
        ...row.coordinates
      ] satisfies Array<string | number | null>;
      const placeholders = [
        "$1",
        "$2",
        "$3",
        "$4",
        "$5",
        ...coordinatePlaceholders(6)
      ];

      await client.query(
        `
          INSERT INTO g25_coordinates (${columns.join(", ")})
          VALUES (${placeholders.join(", ")})
          ON CONFLICT (release_id, sample_id)
          DO UPDATE SET ${updateColumns.join(", ")}
        `,
        params
      );
      inserted += 1;
    }

    await client.query("COMMIT");
    console.log(`Imported ${inserted} G25 row(s) for release '${release.name}' from ${basename(sourceFile)}.`);
    if (skipped) console.log(`Skipped ${skipped} G25 row(s) without matching AADR samples.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
