import { describe, expect, it } from "vitest";
import { compileGlobalSearch, compileSampleFilter, mergeWhere } from "@/lib/filters/compile";
import type { FilterNode } from "@/lib/filters/types";

describe("filter compiler", () => {
  it("compiles nested AND/OR filters with parameters", () => {
    const filter: FilterNode = {
      type: "group",
      op: "and",
      children: [
        { type: "condition", field: "political_entity", operator: "equals", value: "Turkey" },
        {
          type: "group",
          op: "or",
          children: [
            { type: "condition", field: "group_id", operator: "contains", value: "PPN" },
            { type: "condition", field: "group_id", operator: "contains", value: "Neolithic" }
          ]
        },
        { type: "condition", field: "snp_1240k", operator: "gte", value: 400000 }
      ]
    };

    const compiled = compileSampleFilter(filter);
    expect(compiled.text).toContain("s.political_entity = $1");
    expect(compiled.text).toContain("OR");
    expect(compiled.text).toContain("s.snp_1240k >= $4");
    expect(compiled.params).toEqual(["Turkey", "%PPN%", "%Neolithic%", 400000]);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      compileSampleFilter({ type: "condition", field: "snp_1240k; drop table samples", operator: "gte", value: 1 })
    ).toThrow(/Unsupported filter field/);
  });

  it("compiles none/not filter groups", () => {
    const compiled = compileSampleFilter({
      type: "group",
      op: "not",
      children: [{ type: "condition", field: "molecular_sex", operator: "equals", value: "Unknown" }]
    });

    expect(compiled.text).toContain("NOT");
    expect(compiled.params).toEqual(["Unknown"]);
  });

  it("compiles slash-delimited global regex search", () => {
    const compiled = compileGlobalSearch("/Cuba_.*AG/", "group_id");
    expect(compiled.text).toContain("~* $1");
    expect(compiled.text).toContain("s.group_id");
    expect(compiled.params).toEqual(["Cuba_.*AG"]);
  });

  it("renumbers merged fragments", () => {
    const merged = mergeWhere([
      { text: "s.release_id = $1", params: [1] },
      { text: "s.group_id ILIKE $1 AND s.snp_1240k >= $2", params: ["%A%", 10] }
    ]);
    expect(merged.text).toBe("s.release_id = $1 AND s.group_id ILIKE $2 AND s.snp_1240k >= $3");
    expect(merged.params).toEqual([1, "%A%", 10]);
  });
});
