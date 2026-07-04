import { describe, expect, it } from "vitest";
import { cleanCell, normalizeRow, splitTsvLine } from "../../scripts/import-aadr";

describe("AADR import normalization", () => {
  it("splits TSV rows and cleans quoted/null cells", () => {
    expect(splitTsvLine('A\t..\t"B, C"')).toEqual(["A", null, "B, C"]);
    expect(cleanCell("")).toBeNull();
    expect(cleanCell("..")).toBeNull();
  });

  it("requires exactly 49 columns", () => {
    expect(() => normalizeRow(Array.from({ length: 48 }, () => null))).toThrow(/49 columns/);
  });

  it("preserves duplicate ROH columns under distinct keys", () => {
    const values = Array.from({ length: 49 }, (_, index) => String(index + 1));
    const row = normalizeRow(values);
    expect(row.roh_total_20cm_a).toBe(33);
    expect(row.roh_total_20cm_b).toBe(34);
  });
});

