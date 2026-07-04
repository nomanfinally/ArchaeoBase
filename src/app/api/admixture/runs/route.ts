import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
  try {
    const pool = getPool();
    const runs = await pool.query(
      `
        SELECT
          ar.id,
          ar.name,
          ar.k,
          ar.imported_at,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'componentIndex', ac.component_index,
                'colorHex', ac.color_hex,
                'label', ac.label
              )
              ORDER BY ac.component_index
            ) FILTER (WHERE ac.id IS NOT NULL),
            '[]'::jsonb
          ) AS components
        FROM admixture_runs ar
        LEFT JOIN admixture_components ac ON ac.run_id = ar.id
        GROUP BY ar.id
        ORDER BY ar.k, ar.name
      `
    );
    return NextResponse.json({ runs: runs.rows });
  } catch (error) {
    return NextResponse.json({ runs: [], error: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}

