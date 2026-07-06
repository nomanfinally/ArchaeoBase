import "dotenv/config";
import pg from "pg";
import { ensureVariantCallsCached, findVariantBySnpId, getLatestGenotypeDataset } from "../src/lib/genotypes/db";

const { Pool } = pg;

function parseArgs() {
  const args = process.argv.slice(2);
  const snps: string[] = [];
  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      if (key === "snp") snps.push(next);
      else parsed.set(key, next);
      index += 1;
    }
  }

  if (!snps.length) {
    throw new Error("Usage: npm run genotypes:cache -- --snp rs4988235 [--snp rs41380347] [--release v66.2M.aadr.PUB]");
  }

  return {
    snps,
    release: parsed.get("release") ? String(parsed.get("release")) : null
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const args = parseArgs();
  const pool = new Pool({ connectionString, options: "-c jit=off" });
  try {
    const release = args.release
      ? await pool.query("SELECT id, name FROM aadr_releases WHERE name = $1", [args.release])
      : await pool.query("SELECT id, name FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1");
    if (!release.rowCount) {
      throw new Error(args.release ? `Release '${args.release}' was not found.` : "No AADR release has been imported.");
    }

    const dataset = await getLatestGenotypeDataset(pool, release.rows[0].id);
    for (const snp of args.snps) {
      const variant = await findVariantBySnpId(pool, dataset.id, snp);
      const result = await ensureVariantCallsCached(pool, variant.id);
      const status = result.cached ? "already cached" : `cached ${result.inserted} calls`;
      console.log(`${variant.snp_id} ${variant.chromosome}:${variant.physical_position} ${variant.ref_allele ?? "?"}/${variant.alt_allele ?? "?"}: ${status}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
