import { closeSync, openSync, readSync, statSync } from "node:fs";

export const PACKED_ANCESTRYMAP_MAGIC = "GENO";
export const MISSING_CALL_CODE = 3;

export type PackedGenoHeader = {
  magic: typeof PACKED_ANCESTRYMAP_MAGIC;
  sampleCount: number;
  variantCount: number;
  sampleHash: string | null;
  variantHash: string | null;
  rowBytes: number;
};

export type GenotypeCounts = {
  refCount: number | null;
  altCount: number | null;
  isMissing: boolean;
};

export function rowBytesForSampleCount(sampleCount: number) {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new Error(`Invalid PACKEDANCESTRYMAP sample count: ${sampleCount}`);
  }
  return Math.max(48, Math.ceil(sampleCount / 4));
}

export function parsePackedGenoHeader(buffer: Buffer): PackedGenoHeader {
  const nulIndex = buffer.indexOf(0);
  const text = buffer.subarray(0, nulIndex === -1 ? buffer.length : nulIndex).toString("utf8").trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts[0] !== PACKED_ANCESTRYMAP_MAGIC) {
    throw new Error("PACKEDANCESTRYMAP genotype file must start with GENO.");
  }

  const sampleCount = Number(parts[1]);
  const variantCount = Number(parts[2]);
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new Error(`Invalid PACKEDANCESTRYMAP sample count: ${parts[1] ?? "<missing>"}`);
  }
  if (!Number.isInteger(variantCount) || variantCount <= 0) {
    throw new Error(`Invalid PACKEDANCESTRYMAP variant count: ${parts[2] ?? "<missing>"}`);
  }

  return {
    magic: PACKED_ANCESTRYMAP_MAGIC,
    sampleCount,
    variantCount,
    sampleHash: parts[3] ?? null,
    variantHash: parts[4] ?? null,
    rowBytes: rowBytesForSampleCount(sampleCount)
  };
}

export function readPackedGenoHeader(genoPath: string): PackedGenoHeader {
  const stat = statSync(genoPath);
  const bytesToRead = Math.min(stat.size, 8192);
  const fd = openSync(genoPath, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, 0);
    return parsePackedGenoHeader(buffer.subarray(0, bytesRead));
  } finally {
    closeSync(fd);
  }
}

export function packedRowOffset(rowBytes: number, variantIndex: number) {
  if (!Number.isInteger(variantIndex) || variantIndex < 1) {
    throw new Error(`PACKEDANCESTRYMAP variant index must be 1-based, received ${variantIndex}.`);
  }
  return rowBytes * variantIndex;
}

export function readPackedGenotypeRow(genoPath: string, header: PackedGenoHeader, variantIndex: number) {
  if (variantIndex > header.variantCount) {
    throw new Error(`Variant index ${variantIndex} exceeds genotype variant count ${header.variantCount}.`);
  }

  const fd = openSync(genoPath, "r");
  try {
    const row = Buffer.alloc(header.rowBytes);
    const bytesRead = readSync(fd, row, 0, header.rowBytes, packedRowOffset(header.rowBytes, variantIndex));
    if (bytesRead !== header.rowBytes) {
      throw new Error(`Could not read complete genotype row ${variantIndex}; expected ${header.rowBytes} bytes, got ${bytesRead}.`);
    }
    return row;
  } finally {
    closeSync(fd);
  }
}

export function decodePackedCallCodes(row: Buffer, sampleCount: number) {
  const expectedBytes = rowBytesForSampleCount(sampleCount);
  if (row.length < expectedBytes) {
    throw new Error(`Packed genotype row is too short; expected ${expectedBytes} bytes, got ${row.length}.`);
  }

  const calls = new Uint8Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const byte = row[Math.floor(sampleIndex / 4)];
    const shift = 6 - 2 * (sampleIndex % 4);
    calls[sampleIndex] = (byte >> shift) & 3;
  }
  return calls;
}

export function countsForCallCode(callCode: number): GenotypeCounts {
  if (callCode === 0) return { refCount: 0, altCount: 2, isMissing: false };
  if (callCode === 1) return { refCount: 1, altCount: 1, isMissing: false };
  if (callCode === 2) return { refCount: 2, altCount: 0, isMissing: false };
  if (callCode === MISSING_CALL_CODE) return { refCount: null, altCount: null, isMissing: true };
  throw new Error(`Unsupported PACKEDANCESTRYMAP call code: ${callCode}`);
}

export function formatGenotypeCall(callCode: number | null | undefined, refAllele: string | null | undefined, altAllele: string | null | undefined) {
  const ref = refAllele || "?";
  const alt = altAllele || "?";
  if (callCode === 0) return `${alt}/${alt}`;
  if (callCode === 1) return `${ref}/${alt}`;
  if (callCode === 2) return `${ref}/${ref}`;
  return "missing";
}

export function selectedAlleleCount(
  call: Pick<GenotypeCounts, "refCount" | "altCount" | "isMissing">,
  alleleRole: "ref" | "alt"
) {
  if (call.isMissing) return null;
  return alleleRole === "ref" ? call.refCount : call.altCount;
}
