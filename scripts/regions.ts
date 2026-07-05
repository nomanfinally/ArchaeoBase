import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

export const REGION_MAPPING_PATH = "data/political_entity_regions.csv";

export type RegionMapping = {
  politicalEntity: string | null;
  regions: string;
  notes: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export async function loadRegionMappings(path = REGION_MAPPING_PATH) {
  const text = await readFile(resolve(path), "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [headerLine, ...rows] = lines;
  const headers = parseCsvLine(headerLine);
  const politicalIndex = headers.indexOf("political_entity");
  const regionsIndex = headers.indexOf("regions");
  const notesIndex = headers.indexOf("notes");
  if (politicalIndex < 0 || regionsIndex < 0) {
    throw new Error(`Region mapping CSV must contain political_entity and regions columns: ${path}`);
  }
  return rows.map((line) => {
    const values = parseCsvLine(line);
    return {
      politicalEntity: values[politicalIndex] ? values[politicalIndex] : null,
      regions: values[regionsIndex] || "Unknown",
      notes: notesIndex >= 0 ? values[notesIndex] ?? "" : ""
    } satisfies RegionMapping;
  });
}

export async function applySampleRegions(db: Pool | PoolClient, path = REGION_MAPPING_PATH) {
  const mappings = await loadRegionMappings(path);
  await db.query("UPDATE samples SET regions = NULL");
  for (const mapping of mappings) {
    if (mapping.politicalEntity === null) {
      await db.query("UPDATE samples SET regions = $1 WHERE political_entity IS NULL", [mapping.regions]);
    } else {
      await db.query("UPDATE samples SET regions = $1 WHERE political_entity = $2", [mapping.regions, mapping.politicalEntity]);
    }
  }

  const unmapped = await db.query<{ political_entity: string | null; sample_count: number }>(
    `
      SELECT political_entity, count(*)::integer AS sample_count
      FROM samples
      WHERE regions IS NULL
      GROUP BY political_entity
      ORDER BY political_entity NULLS LAST
    `
  );
  if (unmapped.rows.length) {
    const details = unmapped.rows.map((row) => `${row.political_entity ?? "<null>"} (${row.sample_count})`).join(", ");
    throw new Error(`Region mapping is incomplete. Unmapped political entities: ${details}`);
  }

  await db.query("UPDATE sample_map_cache sc SET regions = s.regions FROM samples s WHERE s.id = sc.sample_id");
  await db.query(`
    UPDATE group_map_cache gc
    SET regions = grouped.regions
    FROM (
      SELECT
        sc.release_id,
        sc.group_site_key,
        string_agg(DISTINCT sc.regions, ', ' ORDER BY sc.regions) AS regions
      FROM sample_map_cache sc
      WHERE sc.regions IS NOT NULL
      GROUP BY sc.release_id, sc.group_site_key
    ) grouped
    WHERE grouped.release_id = gc.release_id AND grouped.group_site_key = gc.group_site_key
  `);

  const counts = await db.query<{ regions: string; sample_count: number }>(
    "SELECT regions, count(*)::integer AS sample_count FROM samples GROUP BY regions ORDER BY regions"
  );
  return { mappings, counts: counts.rows };
}
