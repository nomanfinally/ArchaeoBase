import "dotenv/config";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { defaultPeriodDefinitions, type PeriodDefinition } from "../src/lib/periods";

const { Pool } = pg;

const PERIOD_CONFIG_PATH = "data/period_definitions.json";

type ParsedArgs = {
  flags: Map<string, string | boolean>;
  positionals: string[];
};

const knownCommands = new Set([
  "help",
  "status",
  "migrate",
  "import:anno",
  "import:aadr",
  "import:g25",
  "import:genotypes",
  "import:admixture",
  "regions:apply",
  "map:rebuild",
  "map:tune",
  "genotypes:list",
  "genotypes:use",
  "periods:show",
  "periods:export",
  "periods:import"
]);

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(rawKey, inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(rawKey, true);
    } else {
      flags.set(rawKey, next);
      index += 1;
    }
  }

  return { flags, positionals };
}

function flagString(flags: Map<string, string | boolean>, key: string) {
  const value = flags.get(key);
  return typeof value === "string" && value.trim() ? value : null;
}

function flagBoolean(flags: Map<string, string | boolean>, key: string) {
  const value = flags.get(key);
  return value === true || value === "true";
}

function normalizeCommand(argv: string[]) {
  const first = argv[0] ?? "help";
  if (knownCommands.has(first)) return { command: first, rest: argv.slice(1) };
  const second = argv[1];
  if (second && knownCommands.has(`${first}:${second}`)) return { command: `${first}:${second}`, rest: argv.slice(2) };
  return { command: first, rest: argv.slice(1) };
}

function passthroughArgs(parsed: ParsedArgs) {
  const args: string[] = [];
  for (const positional of parsed.positionals) args.push(positional);
  for (const [key, value] of parsed.flags) {
    args.push(`--${key}`);
    if (typeof value === "string") args.push(value);
  }
  return args;
}

async function runNpmScript(script: string, args: string[] = []) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "npm",
      ["run", script, ...(args.length ? ["--", ...args] : [])],
      { stdio: "inherit", shell: process.platform === "win32" }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${script} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }
  return new Pool({ connectionString, options: "-c jit=off" });
}

async function tableExists(pool: pg.Pool, table: string) {
  const result = await pool.query<{ exists: boolean }>("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${table}`]);
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(pool: pg.Pool, table: string, column: string) {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists
    `,
    [table, column]
  );
  return Boolean(result.rows[0]?.exists);
}

async function countRows(pool: pg.Pool, table: string, where = "TRUE", params: unknown[] = []) {
  if (!(await tableExists(pool, table))) return null;
  const result = await pool.query<{ total: number }>(`SELECT count(*)::integer AS total FROM ${table} WHERE ${where}`, params);
  return result.rows[0]?.total ?? 0;
}

async function latestRelease(pool: pg.Pool, releaseName?: string | null) {
  const result = releaseName
    ? await pool.query<{ id: string; name: string; row_count: number }>(
        "SELECT id::text, name, row_count FROM aadr_releases WHERE name = $1",
        [releaseName]
      )
    : await pool.query<{ id: string; name: string; row_count: number }>(
        "SELECT id::text, name, row_count FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1"
      );
  return result.rows[0] ?? null;
}

async function status() {
  const pool = getPool();
  try {
    console.log("ArchaeoBase database status");
    if (!(await tableExists(pool, "aadr_releases"))) {
      console.log("No schema found. Run: npm run ab -- migrate");
      return;
    }

    const release = await latestRelease(pool);
    if (!release) {
      console.log("No AADR release imported.");
      return;
    }

    const sampleCount = await countRows(pool, "samples", "release_id = $1", [release.id]);
    const g25Count = await countRows(pool, "g25_coordinates", "release_id = $1", [release.id]);
    const genotypeCount = await countRows(pool, "genotype_datasets", "release_id = $1", [release.id]);
    const admixtureCount = await countRows(pool, "admixture_runs", "release_id = $1", [release.id]);
    const sampleMapCount = await countRows(pool, "sample_map_cache", "release_id = $1", [release.id]);
    const groupMapCount = await countRows(pool, "group_map_cache", "release_id = $1", [release.id]);

    console.log(`Release: ${release.name} (${release.row_count.toLocaleString("en-US")} imported rows)`);
    console.log(`Samples: ${sampleCount?.toLocaleString("en-US") ?? "n/a"}`);
    console.log(`G25 rows: ${g25Count?.toLocaleString("en-US") ?? "n/a"}`);
    console.log(`Genotype datasets: ${genotypeCount?.toLocaleString("en-US") ?? "n/a"}`);
    console.log(`ADMIXTURE runs: ${admixtureCount?.toLocaleString("en-US") ?? "n/a"}`);
    console.log(`Map cache: ${sampleMapCount?.toLocaleString("en-US") ?? "n/a"} samples, ${groupMapCount?.toLocaleString("en-US") ?? "n/a"} group sites`);

    if (await tableExists(pool, "genotype_datasets")) {
      const activeColumn = await columnExists(pool, "genotype_datasets", "is_active");
      const active = await pool.query<{ id: string; name: string; sample_count: number; variant_count: number; is_active: boolean }>(
        `
          SELECT id::text, name, sample_count, variant_count, ${activeColumn ? "is_active" : "false AS is_active"}
          FROM genotype_datasets
          WHERE release_id = $1
          ORDER BY ${activeColumn ? "is_active DESC," : ""} imported_at DESC, id DESC
          LIMIT 1
        `,
        [release.id]
      );
      if (active.rows[0]) {
        const statusLabel = active.rows[0].is_active ? "Active genotype" : "Latest genotype";
        console.log(`${statusLabel}: #${active.rows[0].id} ${active.rows[0].name} (${active.rows[0].sample_count.toLocaleString("en-US")} samples, ${active.rows[0].variant_count.toLocaleString("en-US")} SNPs)`);
      }
    }
  } finally {
    await pool.end();
  }
}

async function listGenotypes(parsed: ParsedArgs) {
  const pool = getPool();
  try {
    const release = await latestRelease(pool, flagString(parsed.flags, "release"));
    if (!release) throw new Error("No matching AADR release found.");
    const activeColumn = await columnExists(pool, "genotype_datasets", "is_active");
    const rows = await pool.query<{
      id: string;
      name: string;
      sample_count: number;
      variant_count: number;
      is_active?: boolean;
      source_geno_file: string;
      source_snp_file: string;
      source_ind_file: string;
    }>(
      `
        SELECT id::text, name, sample_count, variant_count, ${activeColumn ? "is_active" : "false AS is_active"},
          source_geno_file, source_snp_file, source_ind_file
        FROM genotype_datasets
        WHERE release_id = $1
        ORDER BY ${activeColumn ? "is_active DESC," : ""} imported_at DESC, id DESC
      `,
      [release.id]
    );

    console.log(`Genotype datasets for ${release.name}`);
    if (!rows.rows.length) {
      console.log("No genotype datasets indexed.");
      return;
    }
    console.table(rows.rows.map((row) => ({
      id: row.id,
      active: row.is_active ? "*" : "",
      name: row.name,
      samples: row.sample_count,
      variants: row.variant_count,
      geno: row.source_geno_file
    })));
  } finally {
    await pool.end();
  }
}

async function useGenotype(parsed: ParsedArgs) {
  const id = flagString(parsed.flags, "id");
  const name = flagString(parsed.flags, "name");
  if (!id && !name) throw new Error("Use --id <dataset_id> or --name <dataset_name>.");

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activeColumn = await columnExists(pool, "genotype_datasets", "is_active");
    if (!activeColumn) throw new Error("genotype_datasets.is_active is missing. Run: npm run ab -- migrate");

    const release = await latestRelease(pool, flagString(parsed.flags, "release"));
    if (!release && name) throw new Error("No matching AADR release found.");
    const dataset = id
      ? await client.query<{ id: string; release_id: string; name: string }>(
          "SELECT id::text, release_id::text, name FROM genotype_datasets WHERE id = $1",
          [id]
        )
      : await client.query<{ id: string; release_id: string; name: string }>(
          "SELECT id::text, release_id::text, name FROM genotype_datasets WHERE release_id = $1 AND name = $2",
          [release?.id, name]
        );
    const row = dataset.rows[0];
    if (!row) throw new Error("Genotype dataset was not found.");

    await client.query("UPDATE genotype_datasets SET is_active = false WHERE release_id = $1", [row.release_id]);
    await client.query("UPDATE genotype_datasets SET is_active = true WHERE id = $1", [row.id]);
    await client.query("COMMIT");
    console.log(`Active genotype dataset set to #${row.id} ${row.name}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function validatePeriodDefinitions(value: unknown): PeriodDefinition[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Period definitions must be a non-empty array.");
  const definitions = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Period ${index + 1} must be an object.`);
    }
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const startYear = Number(row.startYear);
    const endYear = Number(row.endYear);
    const light = typeof row.light === "string" ? row.light.trim() : "";
    const dark = typeof row.dark === "string" ? row.dark.trim() : "";
    if (!label) throw new Error(`Period ${index + 1} is missing label.`);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear >= endYear) {
      throw new Error(`Period ${label} has invalid startYear/endYear.`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(light) || !/^#[0-9a-f]{6}$/i.test(dark)) {
      throw new Error(`Period ${label} must use #RRGGBB light/dark colors.`);
    }
    return { label, startYear, endYear, light, dark };
  });

  for (let index = 1; index < definitions.length; index += 1) {
    if (definitions[index].startYear < definitions[index - 1].endYear) {
      throw new Error(`Period ${definitions[index].label} overlaps ${definitions[index - 1].label}.`);
    }
  }
  return definitions;
}

function showPeriods() {
  console.table(defaultPeriodDefinitions.map((period) => ({
    label: period.label,
    startYear: period.startYear,
    endYear: period.endYear,
    light: period.light,
    dark: period.dark
  })));
}

async function exportPeriods(parsed: ParsedArgs) {
  const output = JSON.stringify(defaultPeriodDefinitions, null, 2);
  const file = flagString(parsed.flags, "file");
  if (!file) {
    console.log(output);
    return;
  }
  await writeFile(resolve(file), `${output}\n`, "utf8");
  console.log(`Wrote period definitions to ${file}.`);
}

async function importPeriods(parsed: ParsedArgs) {
  const file = flagString(parsed.flags, "file");
  if (!file) throw new Error("Use --file <period_definitions.json>.");
  const definitions = validatePeriodDefinitions(JSON.parse(await readFile(resolve(file), "utf8")));
  await writeFile(resolve(PERIOD_CONFIG_PATH), `${JSON.stringify(definitions, null, 2)}\n`, "utf8");
  console.log(`Updated ${PERIOD_CONFIG_PATH} with ${definitions.length} period ranges.`);
  if (flagBoolean(parsed.flags, "rebuild-map")) {
    await runNpmScript("db:rebuild-map");
  } else {
    console.log("Run `npm run ab -- map rebuild` to refresh period colors in the map cache.");
  }
}

function help() {
  console.log(`ArchaeoBase CLI

Usage:
  npm run ab -- status
  npm run ab -- migrate

Imports:
  npm run ab -- import anno --file v66.2M.aadr.PUB.anno --release v66.2M.aadr.PUB --replace
  npm run ab -- import g25 --file /path/to/archaeobase_sample_table_g25_filled.csv --replace
  npm run ab -- import genotypes --geno file.geno --snp file.snp --ind file.ind --name dataset --replace
  npm run ab -- import admixture --q run.K5.Q --ids sample_ids.txt --k 5 --name RunName --replace

Updates:
  npm run ab -- regions apply
  npm run ab -- map rebuild
  npm run ab -- map tune --preset balanced

Genotype datasets:
  npm run ab -- genotypes list
  npm run ab -- genotypes use --id 1
  npm run ab -- genotypes use --name reordered_v66.2M.aadr.PUB

Period ranges:
  npm run ab -- periods show
  npm run ab -- periods export --file periods.json
  npm run ab -- periods import --file periods.json --rebuild-map
`);
}

async function main() {
  const { command, rest } = normalizeCommand(process.argv.slice(2));
  const parsed = parseArgs(rest);
  const pass = passthroughArgs(parsed);

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    case "status":
      await status();
      return;
    case "migrate":
      await runNpmScript("db:migrate", pass);
      return;
    case "import:anno":
    case "import:aadr":
      await runNpmScript("import:aadr", pass);
      return;
    case "import:g25":
      await runNpmScript("import:g25", pass);
      return;
    case "import:genotypes":
      await runNpmScript("import:genotype-index", pass);
      return;
    case "import:admixture":
      await runNpmScript("import:admixture", pass);
      return;
    case "regions:apply":
      await runNpmScript("db:regions", pass);
      return;
    case "map:rebuild":
      await runNpmScript("db:rebuild-map", pass);
      return;
    case "map:tune":
      await runNpmScript("db:tune-map", pass);
      return;
    case "genotypes:list":
      await listGenotypes(parsed);
      return;
    case "genotypes:use":
      await useGenotype(parsed);
      return;
    case "periods:show":
      showPeriods();
      return;
    case "periods:export":
      await exportPeriods(parsed);
      return;
    case "periods:import":
      await importPeriods(parsed);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      help();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
