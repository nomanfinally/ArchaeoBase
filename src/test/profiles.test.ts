import { describe, expect, it } from "vitest";
import { parseProfileText, stringifyProfileFile, type ProfileFile } from "@/lib/profiles";
import {
  defaultGroupColumnIds,
  defaultSampleColumnIds,
  filterableSampleFields,
  groupFields,
  operatorsByKind,
  sampleFields
} from "@/lib/schema/fields";

const schema = {
  sampleFields,
  groupFields,
  filterableFields: filterableSampleFields,
  operatorsByKind,
  defaults: {
    sample: defaultSampleColumnIds,
    group: defaultGroupColumnIds
  }
};

describe("profile files", () => {
  it("round trips a YAML profile file", () => {
    const profile: ProfileFile = {
      version: 1,
      activeView: "Neolithic Groups",
      views: [
        {
          name: "Neolithic Groups",
          type: "table",
          entity: "group",
          filters: {
            type: "group",
            op: "and",
            children: [{ type: "condition", field: "period", operator: "equals", value: "Neolithic" }]
          },
          sort: [
            { field: "period_names", direction: "asc" },
            { field: "sample_count", direction: "desc" }
          ],
          order: {
            sample: ["genetic_id", "period", "group_id"],
            group: ["group_id", "period_names", "sample_count"]
          },
          columnSize: {
            sample: { genetic_id: 180 },
            group: { period_names: 220 }
          },
          search: { query: "Anatolia", field: "group_id" },
          pageSize: 250
        }
      ]
    };

    const parsed = parseProfileText(stringifyProfileFile(profile), schema);
    expect(parsed.views[0].name).toBe("Neolithic Groups");
    expect(parsed.views[0].sort).toEqual([
      { field: "period_names", direction: "asc" },
      { field: "sample_count", direction: "desc" }
    ]);
    expect(parsed.views[0].order?.group).toContain("period_names");
  });

  it("rejects unknown filter fields and operators", () => {
    expect(() =>
      parseProfileText(
        `
version: 1
views:
  - name: Unsafe
    type: table
    entity: sample
    filters:
      type: condition
      field: "group_id; drop table samples"
      operator: contains
      value: PPN
`,
        schema
      )
    ).toThrow(/not filterable/);

    expect(() =>
      parseProfileText(
        `
version: 1
views:
  - name: Bad operator
    type: table
    entity: sample
    filters:
      type: condition
      field: snp_1240k
      operator: contains
      value: 1
`,
        schema
      )
    ).toThrow(/not valid/);
  });
});
