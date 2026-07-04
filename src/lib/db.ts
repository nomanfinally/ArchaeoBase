import pg from "pg";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var archaebasePool: pg.Pool | undefined;
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.archaebasePool) {
    globalThis.archaebasePool = new Pool({ connectionString });
  }

  return globalThis.archaebasePool;
}

export async function getLatestReleaseId() {
  const pool = getPool();
  const result = await pool.query<{ id: string; name: string; row_count: number }>(
    "SELECT id, name, row_count FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1"
  );

  if (!result.rowCount) {
    throw new Error("No AADR release has been imported yet. Run npm run db:migrate and npm run import:aadr.");
  }

  return result.rows[0];
}

