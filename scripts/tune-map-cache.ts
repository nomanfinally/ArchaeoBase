import "dotenv/config";
import pg from "pg";
import { MAP_CACHE_DEFAULTS, rebuildMapCache, type MapRebuildOptions } from "../src/lib/map/cache";

const { Pool } = pg;

type PresetName = "tight" | "balanced" | "wide";

const presets: Record<PresetName, MapRebuildOptions> = {
  tight: {
    offsetScale: 4.5,
    sampleAnchorZoom: 13,
    groupAnchorZoom: 12.6,
    sampleSpacingPx: 15,
    groupSpacingPx: 22,
    maxSampleOffsetM: 22000,
    maxGroupOffsetM: 30000
  },
  balanced: MAP_CACHE_DEFAULTS,
  wide: {
    offsetScale: 6.5,
    sampleAnchorZoom: 12.65,
    groupAnchorZoom: 12.3,
    sampleSpacingPx: 18,
    groupSpacingPx: 25,
    maxSampleOffsetM: 34000,
    maxGroupOffsetM: 44000
  }
};

function parseNumber(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

  const presetValue = parsed.get("preset");
  const preset: PresetName = presetValue === "tight" || presetValue === "wide" ? presetValue : "balanced";
  const base = presets[preset];

  return {
    statsOnly: parsed.has("stats-only"),
    preset,
    options: {
      releaseId: typeof parsed.get("release-id") === "string" ? String(parsed.get("release-id")) : null,
      offsetScale: parseNumber(parsed.get("offset-scale"), base.offsetScale ?? MAP_CACHE_DEFAULTS.offsetScale),
      sampleAnchorZoom: parseNumber(parsed.get("sample-anchor-zoom"), base.sampleAnchorZoom ?? MAP_CACHE_DEFAULTS.sampleAnchorZoom),
      groupAnchorZoom: parseNumber(parsed.get("group-anchor-zoom"), base.groupAnchorZoom ?? MAP_CACHE_DEFAULTS.groupAnchorZoom),
      sampleSpacingPx: parseNumber(parsed.get("sample-spacing-px"), base.sampleSpacingPx ?? MAP_CACHE_DEFAULTS.sampleSpacingPx),
      groupSpacingPx: parseNumber(parsed.get("group-spacing-px"), base.groupSpacingPx ?? MAP_CACHE_DEFAULTS.groupSpacingPx),
      maxSampleOffsetM: parseNumber(parsed.get("max-sample-offset-m"), base.maxSampleOffsetM ?? MAP_CACHE_DEFAULTS.maxSampleOffsetM),
      maxGroupOffsetM: parseNumber(parsed.get("max-group-offset-m"), base.maxGroupOffsetM ?? MAP_CACHE_DEFAULTS.maxGroupOffsetM)
    } satisfies MapRebuildOptions
  };
}

async function offsetStats(pool: pg.Pool, table: "sample_map_cache" | "group_map_cache") {
  const originalLatitude = table === "sample_map_cache" ? "original_latitude" : "centroid_latitude";
  const originalLongitude = table === "sample_map_cache" ? "original_longitude" : "centroid_longitude";
  const where = table === "sample_map_cache"
    ? "coordinate_status = 'ok' AND display_latitude IS NOT NULL AND display_longitude IS NOT NULL"
    : "display_latitude IS NOT NULL AND display_longitude IS NOT NULL";

  const result = await pool.query(`
    WITH offsets AS (
      SELECT ST_Distance(
        ST_Transform(ST_SetSRID(ST_MakePoint(${originalLongitude}, ${originalLatitude}), 4326), 3857),
        ST_Transform(ST_SetSRID(ST_MakePoint(display_longitude, display_latitude), 4326), 3857)
      ) AS offset_m
      FROM ${table}
      WHERE ${where}
    )
    SELECT
      count(*)::integer AS mapped,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY offset_m)::double precision AS p50_m,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY offset_m)::double precision AS p90_m,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY offset_m)::double precision AS p99_m,
      max(offset_m)::double precision AS max_m
    FROM offsets
  `);
  return result.rows[0] as { mapped: number; p50_m: number; p90_m: number; p99_m: number; max_m: number };
}

function meters(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value as number).toLocaleString("en-US")} m`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const { preset, options, statsOnly } = parseArgs();
  const pool = new Pool({ connectionString, options: "-c jit=off" });
  try {
    console.log(`Map cache tuning preset: ${preset}`);
    console.log(
      `Settings: offset=${options.offsetScale}, sampleZoom=${options.sampleAnchorZoom}, samplePx=${options.sampleSpacingPx}, sampleMax=${options.maxSampleOffsetM}m`
    );
    console.log(
      `          groupZoom=${options.groupAnchorZoom}, groupPx=${options.groupSpacingPx}, groupMax=${options.maxGroupOffsetM}m`
    );

    if (!statsOnly) {
      const result = await rebuildMapCache(pool, options);
      console.log(`Rebuilt ${result.releases} release(s): ${result.samples} samples, ${result.groups} group sites.`);
    }

    const sample = await offsetStats(pool, "sample_map_cache");
    const group = await offsetStats(pool, "group_map_cache");
    console.log(`Sample offsets: n=${sample.mapped}, p50=${meters(sample.p50_m)}, p90=${meters(sample.p90_m)}, p99=${meters(sample.p99_m)}, max=${meters(sample.max_m)}`);
    console.log(`Group offsets:  n=${group.mapped}, p50=${meters(group.p50_m)}, p90=${meters(group.p90_m)}, p99=${meters(group.p99_m)}, max=${meters(group.max_m)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
