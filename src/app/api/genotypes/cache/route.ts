import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestReleaseId, getPool } from "@/lib/db";
import { clearVariantCallsCache, ensureVariantCallsCached, findVariantBySnpId, getLatestGenotypeDataset } from "@/lib/genotypes/db";

const requestSchema = z.object({
  snpId: z.string().min(1)
});

const deleteSchema = z.object({
  snpId: z.string().min(1).optional()
});

function publicVariant(variant: {
  id: string;
  dataset_id: string;
  variant_index: number;
  snp_id: string;
  chromosome: string;
  genetic_position: number | null;
  physical_position: string | number | null;
  ref_allele: string | null;
  alt_allele: string | null;
  sample_count?: number;
}) {
  return {
    id: variant.id,
    dataset_id: variant.dataset_id,
    variant_index: variant.variant_index,
    snp_id: variant.snp_id,
    chromosome: variant.chromosome,
    genetic_position: variant.genetic_position,
    physical_position: variant.physical_position,
    ref_allele: variant.ref_allele,
    alt_allele: variant.alt_allele,
    sample_count: variant.sample_count
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const pool = getPool();
    const release = await getLatestReleaseId();
    const dataset = await getLatestGenotypeDataset(pool, release.id);
    const variant = await findVariantBySnpId(pool, dataset.id, parsed.snpId.trim());
    const result = await ensureVariantCallsCached(pool, variant.id);
    return NextResponse.json({
      release,
      variant: publicVariant(result.variant),
      cached: result.cached,
      inserted: result.inserted,
      sampleCount: result.variant.sample_count
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Genotype cache failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const text = await request.text();
    const parsed = deleteSchema.parse(text.trim() ? JSON.parse(text) : {});
    const pool = getPool();
    const release = await getLatestReleaseId();
    const result = await clearVariantCallsCache(pool, release.id, parsed.snpId);
    return NextResponse.json({
      release,
      scope: result.scope,
      deleted: result.deleted,
      variant: result.variant ? publicVariant(result.variant) : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Genotype cache clear failed" },
      { status: 400 }
    );
  }
}
