import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestReleaseId } from "@/lib/db";
import type { QueryRequest } from "@/lib/filters/types";
import { runQuery } from "@/lib/query/run";

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_CACHE_MAX_ENTRIES = 50;
const queryResponseCache = new Map<string, { createdAt: number; result: Awaited<ReturnType<typeof runQuery>> }>();

const filterNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal("condition"),
      field: z.string(),
      operator: z.string(),
      value: z.unknown().optional()
    }),
    z.object({
      type: z.literal("group"),
      op: z.union([z.literal("and"), z.literal("or"), z.literal("not")]),
      children: z.array(filterNodeSchema)
    })
  ])
);

const requestSchema = z.object({
  entity: z.union([z.literal("sample"), z.literal("group")]).default("sample"),
  view: z.union([z.literal("table"), z.literal("map")]).default("table"),
  filter: filterNodeSchema.nullish(),
  globalSearch: z.string().optional(),
  searchField: z.string().nullish(),
  sort: z
    .array(
      z.object({
        field: z.string(),
        direction: z.union([z.literal("asc"), z.literal("desc")])
      })
    )
    .optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  visibleColumns: z.array(z.string()).optional(),
  mapBounds: z
    .object({
      west: z.number(),
      south: z.number(),
      east: z.number(),
      north: z.number()
    })
    .nullish(),
  admixtureRunId: z.number().int().positive().nullish()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body) as QueryRequest;
    const release = await getLatestReleaseId();
    const cacheKey = JSON.stringify({ releaseId: release.id, request: parsed });
    const cached = queryResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < QUERY_CACHE_TTL_MS) {
      queryResponseCache.delete(cacheKey);
      queryResponseCache.set(cacheKey, cached);
      return NextResponse.json(cached.result);
    }

    const result = await runQuery(parsed);
    queryResponseCache.set(cacheKey, { createdAt: Date.now(), result });
    if (queryResponseCache.size > QUERY_CACHE_MAX_ENTRIES) {
      const oldestKey = queryResponseCache.keys().next().value;
      if (oldestKey) queryResponseCache.delete(oldestKey);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown query error"
      },
      { status: 400 }
    );
  }
}
