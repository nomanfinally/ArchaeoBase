import "dotenv/config";
import pg from "pg";
import { applySampleRegions } from "./regions";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const pool = new Pool({ connectionString, options: "-c jit=off" });
  try {
    const result = await applySampleRegions(pool);
    console.log(`Applied ${result.mappings.length} political entity region mappings.`);
    for (const row of result.counts) {
      console.log(`${row.regions}: ${row.sample_count}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
