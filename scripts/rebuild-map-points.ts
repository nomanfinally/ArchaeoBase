import "dotenv/config";
import pg from "pg";
import { MAP_CACHE_DEFAULTS, rebuildMapCache, type MapRebuildOptions } from "../src/lib/map/cache";

const { Pool } = pg;

function parseNumber(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(): MapRebuildOptions {
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

  return {
    releaseId: typeof parsed.get("release-id") === "string" ? String(parsed.get("release-id")) : null,
    offsetScale: parseNumber(parsed.get("offset-scale"), MAP_CACHE_DEFAULTS.offsetScale),
    sampleAnchorZoom: parseNumber(parsed.get("sample-anchor-zoom"), MAP_CACHE_DEFAULTS.sampleAnchorZoom),
    groupAnchorZoom: parseNumber(parsed.get("group-anchor-zoom"), MAP_CACHE_DEFAULTS.groupAnchorZoom),
    sampleSpacingPx: parseNumber(parsed.get("sample-spacing-px"), MAP_CACHE_DEFAULTS.sampleSpacingPx),
    groupSpacingPx: parseNumber(parsed.get("group-spacing-px"), MAP_CACHE_DEFAULTS.groupSpacingPx),
    maxSampleOffsetM: parseNumber(parsed.get("max-sample-offset-m"), MAP_CACHE_DEFAULTS.maxSampleOffsetM),
    maxGroupOffsetM: parseNumber(parsed.get("max-group-offset-m"), MAP_CACHE_DEFAULTS.maxGroupOffsetM)
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env or export DATABASE_URL.");
  }

  const pool = new Pool({ connectionString, options: "-c jit=off" });
  try {
    const result = await rebuildMapCache(pool, parseArgs());
    console.log(`Map cache rebuilt for ${result.releases} release(s): ${result.samples} samples, ${result.groups} group sites.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
