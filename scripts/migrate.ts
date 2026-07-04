import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const sql = await readFile(resolve("db/schema.sql"), "utf8");
  const pool = new Pool({ connectionString });

  try {
    await pool.query(sql);
    console.log("Database schema is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
