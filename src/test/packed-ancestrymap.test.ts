import fs from "node:fs";
import readline from "node:readline";
import { describe, expect, it } from "vitest";
import {
  countsForCallCode,
  decodePackedCallCodes,
  packedRowOffset,
  parsePackedGenoHeader,
  readPackedGenoHeader,
  readPackedGenotypeRow,
  rowBytesForSampleCount
} from "@/lib/genotypes/packed-ancestrymap";

describe("PACKEDANCESTRYMAP parser", () => {
  it("parses the packed GENO header and row-byte count", () => {
    const header = parsePackedGenoHeader(Buffer.from("GENO 5 10 abcd ef01\n".padEnd(48, "\0")));
    expect(header.sampleCount).toBe(5);
    expect(header.variantCount).toBe(10);
    expect(header.sampleHash).toBe("abcd");
    expect(header.variantHash).toBe("ef01");
    expect(header.rowBytes).toBe(48);
  });

  it("uses 48 bytes as the minimum packed row size", () => {
    expect(rowBytesForSampleCount(1)).toBe(48);
    expect(rowBytesForSampleCount(192)).toBe(48);
    expect(rowBytesForSampleCount(193)).toBe(49);
    expect(rowBytesForSampleCount(23265)).toBe(5817);
  });

  it("seeks one row after the header block using one-based SNP indexes", () => {
    expect(packedRowOffset(5817, 1)).toBe(5817);
    expect(packedRowOffset(5817, 241941)).toBe(5817 * 241941);
  });

  it("decodes high-order two-bit calls in sample order", () => {
    const row = Buffer.alloc(48);
    row[0] = 0b00011011;
    const calls = decodePackedCallCodes(row, 5);
    expect(Array.from(calls)).toEqual([0, 1, 2, 3, 0]);
  });

  it("maps AADR packed codes to ref/alt counts", () => {
    expect(countsForCallCode(0)).toEqual({ refCount: 0, altCount: 2, isMissing: false });
    expect(countsForCallCode(1)).toEqual({ refCount: 1, altCount: 1, isMissing: false });
    expect(countsForCallCode(2)).toEqual({ refCount: 2, altCount: 0, isMissing: false });
    expect(countsForCallCode(3)).toEqual({ refCount: null, altCount: null, isMissing: true });
  });
});

async function findVariantIndexes(snpPath: string, snpIds: string[]) {
  const wanted = new Set(snpIds);
  const indexes = new Map<string, number>();
  const reader = readline.createInterface({
    input: fs.createReadStream(snpPath),
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    const snpId = line.trim().split(/\s+/, 1)[0];
    if (wanted.has(snpId)) indexes.set(snpId, lineNumber);
    if (indexes.size === wanted.size) {
      reader.close();
      break;
    }
  }
  return indexes;
}

const genoPath = process.env.AADR_GENO_PATH;
const snpPath = process.env.AADR_SNP_PATH;
const runAadrIntegration = Boolean(genoPath && snpPath && fs.existsSync(genoPath) && fs.existsSync(snpPath));

describe("AADR genotype examples", () => {
  const integrationIt = runAadrIntegration ? it : it.skip;

  integrationIt("matches current rs4988235 and rs41380347 packed-row counts", async () => {
    const header = readPackedGenoHeader(genoPath!);
    const indexes = await findVariantIndexes(snpPath!, ["rs4988235", "rs41380347"]);

    const countCodes = (snpId: string) => {
      const variantIndex = indexes.get(snpId);
      if (!variantIndex) throw new Error(`${snpId} was not found in ${snpPath}`);
      const calls = decodePackedCallCodes(readPackedGenotypeRow(genoPath!, header, variantIndex), header.sampleCount);
      return calls.reduce<Record<number, number>>((counts, code) => {
        counts[code] = (counts[code] ?? 0) + 1;
        return counts;
      }, {});
    };

    expect(countCodes("rs4988235")).toEqual({ 0: 1602, 1: 582, 2: 13499, 3: 7582 });
    expect(countCodes("rs41380347")).toEqual({ 0: 7, 1: 7, 2: 15001, 3: 8250 });
  });
});
