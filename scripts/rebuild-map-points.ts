import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const pool = new Pool({ connectionString, options: "-c jit=off" });
  try {
    await pool.query("REFRESH MATERIALIZED VIEW sample_map_points");
    console.log("Map point materialization rebuilt.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
