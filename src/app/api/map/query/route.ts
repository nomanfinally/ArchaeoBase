import { NextResponse } from "next/server";
import { z } from "zod";
import { mapSnpPalettes, type MapQueryRequest, type MapSnpPalette } from "@/lib/map/types";
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

const snpCopyStateSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal("missing")]);

const snpFilterSchema = z.object({
  snpId: z.string().min(1),
  alleleRole: z.union([z.literal("ref"), z.literal("alt")]).default("alt"),
  copyStates: z.array(snpCopyStateSchema).default([1, 2])
});

const snpColorSchema = z.object({
  snpId: z.string().min(1),
  alleleRole: z.union([z.literal("ref"), z.literal("alt")]).default("alt")
});

const mapSnpPaletteIds = mapSnpPalettes.map((palette) => palette.id) as [MapSnpPalette, ...MapSnpPalette[]];

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
  presentation: z.union([z.literal("smart_split"), z.literal("group_locations"), z.literal("sample_cloud")]).default("sample_cloud"),
  combineNearbyGroups: z.boolean().optional(),
  colorMode: z.union([z.literal("fixed"), z.literal("gradient"), z.literal("snp")]).default("fixed"),
  colorBy: z
    .union([
      z.literal("single"),
      z.literal("sex"),
      z.literal("data_type"),
      z.literal("group_cluster"),
      z.literal("y_haplogroup_initial"),
      z.literal("mtdna_initial"),
      z.literal("period")
    ])
    .default("sex"),
  gradientBy: z.union([z.literal("snp_1240k"), z.literal("snp_2m"), z.literal("coverage_1150k"), z.literal("date_mean_bp"), z.literal("smart_date_mean_bp")]).default("snp_1240k"),
  colorTheme: z.union([z.literal("light"), z.literal("dark")]).default("light"),
  showGroupCounts: z.boolean().optional(),
  snpFilters: z.array(snpFilterSchema).optional(),
  snpColor: snpColorSchema.nullish(),
  snpPalette: z.enum(mapSnpPaletteIds).optional(),
  includeSnpZeroCopies: z.boolean().optional()
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
