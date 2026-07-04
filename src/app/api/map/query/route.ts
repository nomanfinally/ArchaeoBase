import { NextResponse } from "next/server";
import { z } from "zod";
import type { MapQueryRequest } from "@/lib/map/types";
import { runMapQuery } from "@/lib/map/query";

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
  filter: filterNodeSchema.nullish(),
  globalSearch: z.string().optional(),
  searchField: z.string().nullish(),
  bounds: z
    .object({
      west: z.number(),
      south: z.number(),
      east: z.number(),
      north: z.number()
    })
    .nullish(),
  zoom: z.number().optional(),
  viewport: z
    .object({
      width: z.number(),
      height: z.number()
    })
    .nullish(),
  presentation: z.union([z.literal("smart_split"), z.literal("group_locations"), z.literal("sample_cloud")]).default("smart_split"),
  combineNearbyGroups: z.boolean().optional(),
  colorBy: z
    .union([
      z.literal("default"),
      z.literal("sex"),
      z.literal("period"),
      z.literal("country"),
      z.literal("data_type"),
      z.literal("assessment"),
      z.literal("sample_count"),
      z.literal("multi_site")
    ])
    .default("default")
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body) as MapQueryRequest;
    const result = await runMapQuery(parsed);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown map query error"
      },
      { status: 400 }
    );
  }
}
