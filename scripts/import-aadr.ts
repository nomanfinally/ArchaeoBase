import "dotenv/config";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;

export const AADR_FIELD_KEYS = [
  "genetic_id",
  "persistent_genetic_id",
  "individual_id",
  "skeletal_code",
  "skeletal_element",
  "first_publication",
  "publication",
  "doi",
  "repository",
  "date_method",
  "date_mean_bp",
  "date_sd_bp",
  "full_date",
  "age_morphological",
  "group_id",
  "locality",
  "political_entity",
  "latitude",
  "longitude",
  "pulldown_strategy",
  "suffixes",
  "data_type",
  "no_libraries",
  "coverage_1150k",
  "coverage_non_targeted",
  "snp_2m",
  "snp_1240k",
  "snp_ho",
  "snp_compatibility",
  "snp_compatibility_ho",
  "molecular_sex",
  "family_relations",
  "roh_total_20cm_a",
  "roh_total_20cm_b",
  "y_hap_terminal",
  "y_hap_isogg",
  "y_hap_manual",
  "mtdna_coverage",
  "mtdna_haplogroup",
  "mtdna_match_consensus",
  "damage_rate",
  "sex_ratio",
  "angsd_mom_ci",
  "hapconx_ci",
  "library_type",
  "libraries",
  "endogenous_by_library",
  "assessment",
  "assessment_warnings"
] as const;

const INTEGER_FIELDS = new Set([
  "no_libraries",
  "snp_2m",
  "snp_1240k",
  "snp_ho",
  "snp_compatibility",
  "snp_compatibility_ho"
]);

const NUMBER_FIELDS = new Set([
  "date_mean_bp",
  "date_sd_bp",
  "latitude",
  "longitude",
  "coverage_1150k",
  "coverage_non_targeted",
  "roh_total_20cm_a",
  "roh_total_20cm_b",
  "mtdna_coverage",
  "damage_rate",
  "sex_ratio"
]);

type FieldKey = (typeof AADR_FIELD_KEYS)[number];

export function splitTsvLine(line: string): (string | null)[] {
  return line.split("\t").map(cleanCell);
}

export function cleanCell(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "..") return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return trimmed;
}

export function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInteger(value: string | null): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function normalizeRow(values: (string | null)[]) {
  if (values.length !== 49) {
    throw new Error(`Expected 49 columns, received ${values.length}.`);
  }

  const row: Record<FieldKey, string | number | null> = {} as Record<FieldKey, string | number | null>;
  AADR_FIELD_KEYS.forEach((key, index) => {
    const value = values[index] ?? null;
    if (INTEGER_FIELDS.has(key)) row[key] = toInteger(value);
    else if (NUMBER_FIELDS.has(key)) row[key] = toNumber(value);
    else row[key] = value;
  });

  return row;
}

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

  const file = String(parsed.get("file") ?? process.env.AADR_ANNO_PATH ?? "v66.2M.aadr.PUB.anno");
  const release = String(parsed.get("release") ?? basename(file).replace(/\.anno$/i, ""));
  const replace = parsed.get("replace") === true || parsed.get("replace") === "true";
  return { file, release, replace };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const { file, release, replace } = parseArgs();
  const sourceFile = resolve(file);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  let rowCount = 0;

  try {
    await client.query("BEGIN");

    const input = createInterface({
      input: createReadStream(sourceFile, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    let headers: (string | null)[] | null = null;
    let releaseId: string | null = null;

    for await (const line of input) {
      if (!headers) {
        headers = splitTsvLine(line);
        if (headers.length !== 49) {
          throw new Error(`AADR header must have 49 columns, received ${headers.length}.`);
        }

        const existing = await client.query("SELECT id FROM aadr_releases WHERE name = $1", [release]);
        if (existing.rowCount && !replace) {
          throw new Error(`Release '${release}' already exists. Re-run with --replace to re-import.`);
        }

        if (existing.rowCount && replace) {
          releaseId = existing.rows[0].id;
          await client.query("DELETE FROM aadr_releases WHERE id = $1", [releaseId]);
        }

        const created = await client.query(
          "INSERT INTO aadr_releases (name, source_file, header) VALUES ($1, $2, $3) RETURNING id",
          [release, sourceFile, JSON.stringify(headers)]
        );
        releaseId = created.rows[0].id;
        continue;
      }

      const values = splitTsvLine(line);
      const row = normalizeRow(values);
      rowCount += 1;

      const dateMeanBp = row.date_mean_bp as number | null;
      const latitude = row.latitude as number | null;
      const longitude = row.longitude as number | null;
      const hasCoordinates = latitude !== null && longitude !== null;
      const dateMeanYearCe = dateMeanBp === null ? null : 1950 - dateMeanBp;

      const columns = [
        "release_id",
        "row_number",
        ...AADR_FIELD_KEYS,
        "date_mean_year_ce",
        "has_coordinates",
        "geom"
      ];

      const params = [
        releaseId,
        rowCount + 1,
        ...AADR_FIELD_KEYS.map((key) => row[key]),
        dateMeanYearCe,
        hasCoordinates
      ];

      const placeholders = params.map((_, index) => `$${index + 1}`);
      const latitudeParam = 2 + AADR_FIELD_KEYS.indexOf("latitude") + 1;
      const longitudeParam = 2 + AADR_FIELD_KEYS.indexOf("longitude") + 1;
      placeholders.push(
        hasCoordinates
          ? `ST_SetSRID(ST_MakePoint($${longitudeParam}, $${latitudeParam}), 4326)`
          : "NULL"
      );

      const inserted = await client.query(
        `INSERT INTO samples (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`,
        params
      );

      const rawRow = Object.fromEntries(headers.map((header, index) => [header ?? `column_${index + 1}`, values[index] ?? null]));
      await client.query(
        "INSERT INTO sample_raw_rows (sample_id, raw_row, raw_line) VALUES ($1, $2, $3)",
        [inserted.rows[0].id, JSON.stringify(rawRow), line]
      );

      if (rowCount % 1000 === 0) {
        process.stdout.write(`Imported ${rowCount} rows\r`);
      }
    }

    if (!headers || !releaseId) {
      throw new Error("Input file appears to be empty.");
    }

    await client.query("UPDATE aadr_releases SET row_count = $1, imported_at = now() WHERE id = $2", [
      rowCount,
      releaseId
    ]);
    await client.query("COMMIT");
    console.log(`\nImported ${rowCount} AADR rows into release '${release}'.`);
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
