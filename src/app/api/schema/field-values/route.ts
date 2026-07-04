import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestReleaseId, getPool } from "@/lib/db";
import { sampleFieldById } from "@/lib/schema/fields";

const requestSchema = z.object({
  field: z.string().min(1),
  q: z.string().optional().default(""),
  limit: z.coerce.number().int().min(1).max(80).optional().default(50)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = requestSchema.parse({
      field: url.searchParams.get("field"),
      q: url.searchParams.get("q") ?? "",
      limit: url.searchParams.get("limit") ?? undefined
    });
    const field = sampleFieldById[parsed.field];
    if (!field?.filterable || !field.sampleColumn) {
      return NextResponse.json({ error: "Unsupported field." }, { status: 400 });
    }

    const release = await getLatestReleaseId();
    const pool = getPool();
    const params: unknown[] = [release.id];
    const trimmed = parsed.q.trim();
    let where = `s.release_id = $1 AND ${field.sampleColumn} IS NOT NULL AND ${field.sampleColumn}::text <> ''`;
    if (trimmed) {
      params.push(`%${trimmed}%`);
      where += ` AND ${field.sampleColumn}::text ILIKE $${params.length}`;
    }
    params.push(parsed.limit);

    const values = await pool.query<{ value: string }>(
      `
        SELECT value
        FROM (
          SELECT DISTINCT ${field.sampleColumn}::text AS value
          FROM samples s
          WHERE ${where}
        ) distinct_values
        ORDER BY value
        LIMIT $${params.length}
      `,
      params
    );

    return NextResponse.json({ values: values.rows.map((row) => row.value) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown field value error" }, { status: 400 });
  }
}
