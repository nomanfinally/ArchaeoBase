import { NextResponse } from "next/server";
import { getLatestReleaseId, getPool } from "@/lib/db";
import { searchGenotypeVariants } from "@/lib/genotypes/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const release = await getLatestReleaseId();
    const variants = await searchGenotypeVariants(getPool(), release.id, q, limit);
    return NextResponse.json({ release, variants });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Variant search failed" },
      { status: 400 }
    );
  }
}
