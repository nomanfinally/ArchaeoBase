import "dotenv/config";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, resolve } from "node:path";
import pg from "pg";
import { readPackedGenoHeader } from "../src/lib/genotypes/packed-ancestrymap";

const { Pool } = pg;

type IndRow = {
  sampleIndex: number;
  geneticId: string;
  sex: string | null;
  groupLabel: string | null;
};

type VariantRow = {
  variantIndex: number;
  snpId: string;
  chromosome: string;
  geneticPosition: number | null;
  physicalPosition: number | null;
  refAllele: string | null;
  altAllele: string | null;
};

function parseArgs() {
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

  const geno = String(parsed.get("geno") ?? process.env.AADR_GENO_PATH ?? "");
  const snp = String(parsed.get("snp") ?? process.env.AADR_SNP_PATH ?? "");
  const ind = String(parsed.get("ind") ?? process.env.AADR_IND_PATH ?? "");
  if (!geno || !snp || !ind) {
    throw new Error("Usage: npm run import:genotype-index -- --geno file.geno --snp file.snp --ind file.ind [--release name] [--name name] [--replace]");
  }

  return {
    geno: resolve(geno),
    snp: resolve(snp),
    ind: resolve(ind),
    release: parsed.get("release") ? String(parsed.get("release")) : null,
    name: parsed.get("name") ? String(parsed.get("name")) : basename(geno).replace(/\.geno$/i, ""),
    replace: parsed.get("replace") === true || parsed.get("replace") === "true"
  };
}

function toNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: string | undefined) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

async function readIndRows(path: string) {
  const input = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  const rows: IndRow[] = [];
  let sampleIndex = 0;
  for await (const line of input) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [geneticId, sex, groupLabel] = trimmed.split(/\s+/);
    sampleIndex += 1;
    rows.push({
      sampleIndex,
      geneticId,
      sex: sex || null,
      groupLabel: groupLabel || null
    });
  }
  return rows;
}

function parseSnpLine(line: string, variantIndex: number): VariantRow {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(`SNP line ${variantIndex} has ${parts.length} columns; expected at least 4.`);
  }
  return {
    variantIndex,
    snpId: parts[0],
    chromosome: parts[1],
    geneticPosition: toNumber(parts[2]),
    physicalPosition: toInteger(parts[3]),
    refAllele: parts[4] || null,
    altAllele: parts[5] || null
  };
}

async function insertRows<T extends Record<string, unknown>>(client: pg.PoolClient, table: string, columns: string[], rows: T[]) {
  if (!rows.length) return;
  const batchSize = Math.max(1, Math.floor(55000 / columns.length));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const params: unknown[] = [];
    const values = batch.map((row) => {
      const placeholders = columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}`, params);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const args = parseArgs();
  const header = readPackedGenoHeader(args.geno);
  const indRows = await readIndRows(args.ind);
  if (indRows.length !== header.sampleCount) {
    throw new Error(`IND file has ${indRows.length} samples but GENO header has ${header.sampleCount}.`);
  }

  const pool = new Pool({ connectionString, options: "-c jit=off" });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const releaseResult = args.release
      ? await client.query("SELECT id, name FROM aadr_releases WHERE name = $1", [args.release])
      : await client.query("SELECT id, name FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1");
    if (!releaseResult.rowCount) {
      throw new Error(args.release ? `Release '${args.release}' was not found.` : "No AADR release has been imported.");
    }
    const releaseId = releaseResult.rows[0].id;

    const existing = await client.query("SELECT id FROM genotype_datasets WHERE release_id = $1 AND name = $2", [releaseId, args.name]);
    if (existing.rowCount && !args.replace) {
      throw new Error(`Genotype dataset '${args.name}' already exists. Re-run with --replace.`);
    }
    if (existing.rowCount && args.replace) {
      await client.query("DELETE FROM genotype_datasets WHERE id = $1", [existing.rows[0].id]);
    }
    await client.query("UPDATE genotype_datasets SET is_active = false WHERE release_id = $1", [releaseId]);

    const sampleLookup = await client.query<{ id: string; genetic_id: string }>(
      "SELECT id::text, genetic_id FROM samples WHERE release_id = $1 AND genetic_id = ANY($2)",
      [releaseId, indRows.map((row) => row.geneticId)]
    );
    const sampleIdByGeneticId = new Map(sampleLookup.rows.map((row) => [row.genetic_id, row.id]));
    const missing = indRows.filter((row) => !sampleIdByGeneticId.has(row.geneticId));
    if (missing.length) {
      throw new Error(`IND file contains ${missing.length} IDs not present in samples. First missing ID: ${missing[0].geneticId}`);
    }

    const dataset = await client.query(
      `
        INSERT INTO genotype_datasets
          (release_id, name, source_geno_file, source_snp_file, source_ind_file, sample_count, variant_count, row_bytes, header_sample_hash, header_variant_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING id
      `,
      [
        releaseId,
        args.name,
        args.geno,
        args.snp,
        args.ind,
        header.sampleCount,
        header.variantCount,
        header.rowBytes,
        header.sampleHash,
        header.variantHash
      ]
    );
    const datasetId = dataset.rows[0].id;

    await insertRows(
      client,
      "genotype_dataset_samples",
      ["dataset_id", "sample_index", "sample_id", "genetic_id", "sex", "group_label"],
      indRows.map((row) => ({
        dataset_id: datasetId,
        sample_index: row.sampleIndex,
        sample_id: sampleIdByGeneticId.get(row.geneticId),
        genetic_id: row.geneticId,
        sex: row.sex,
        group_label: row.groupLabel
      }))
    );

    const input = createInterface({
      input: createReadStream(args.snp, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    const variantBatch: Array<Record<string, unknown>> = [];
    let variantCount = 0;
    for await (const line of input) {
      if (!line.trim()) continue;
      variantCount += 1;
      const row = parseSnpLine(line, variantCount);
      variantBatch.push({
        dataset_id: datasetId,
        variant_index: row.variantIndex,
        snp_id: row.snpId,
        chromosome: row.chromosome,
        genetic_position: row.geneticPosition,
        physical_position: row.physicalPosition,
        ref_allele: row.refAllele,
        alt_allele: row.altAllele
      });
      if (variantBatch.length >= 6000) {
        await insertRows(
          client,
          "genotype_variants",
          ["dataset_id", "variant_index", "snp_id", "chromosome", "genetic_position", "physical_position", "ref_allele", "alt_allele"],
          variantBatch
        );
        variantBatch.length = 0;
        if (variantCount % 60000 === 0) process.stdout.write(`Indexed ${variantCount} SNPs\r`);
      }
    }
    await insertRows(
      client,
      "genotype_variants",
      ["dataset_id", "variant_index", "snp_id", "chromosome", "genetic_position", "physical_position", "ref_allele", "alt_allele"],
      variantBatch
    );
    if (variantCount !== header.variantCount) {
      throw new Error(`SNP file has ${variantCount} variants but GENO header has ${header.variantCount}.`);
    }

    await client.query("COMMIT");
    console.log(`\nIndexed genotype dataset '${args.name}' for release '${releaseResult.rows[0].name}': ${header.sampleCount} samples, ${variantCount} SNPs.`);
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
