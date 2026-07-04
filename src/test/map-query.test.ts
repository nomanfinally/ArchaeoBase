import { describe, expect, it } from "vitest";
import { assessCoordinate } from "@/lib/map/coordinate-sanity";
import {
  applyMapLayout,
  buildGroupFeatures,
  buildMapSampleWhere,
  buildSampleFeatures,
  buildSmartFeatures,
  type SampleMapRow
} from "@/lib/map/query";

function row(overrides: Partial<SampleMapRow>): SampleMapRow {
  return {
    id: "1",
    genetic_id: "S1",
    group_id: "G1",
    locality: "Site",
    political_entity: "Cuba",
    date_mean_year_ce: 100,
    snp_1240k: 1000,
    molecular_sex: "M",
    y_hap_isogg: null,
    y_hap_terminal: null,
    mtdna_haplogroup: null,
    data_type: "1240k",
    assessment: null,
    latitude: 21.5,
    longitude: -77.8,
    ...overrides
  };
}

const worldBounds = { west: -180, south: -85, east: 180, north: 85 };
const viewport = { width: 1280, height: 720 };

describe("map query helpers", () => {
  it("compiles map filters through sample fields and parameterized bounds", () => {
    const compiled = buildMapSampleWhere(
      {
        filter: { type: "condition", field: "political_entity", operator: "equals", value: "Cuba" },
        bounds: { west: -90, south: 15, east: -70, north: 30 }
      },
      "7",
      { requireCoordinates: true, bounds: { west: -90, south: 15, east: -70, north: 30 } }
    );

    expect(compiled.text).toContain("s.release_id = $1");
    expect(compiled.text).toContain("s.political_entity = $2");
    expect(compiled.text).toContain("mp.has_coordinates IS TRUE");
    expect(compiled.text).toContain("ST_MakeEnvelope($3, $4, $5, $6, 4326)");
    expect(compiled.params).toEqual(["7", "Cuba", -90, 15, -70, 30]);
  });

  it("keeps missing-coordinate samples separate from bounded mapped queries", () => {
    const compiled = buildMapSampleWhere({}, "7", { missingCoordinates: true });
    expect(compiled.text).toContain("s.release_id = $1");
    expect(compiled.text).toContain("s.has_coordinates IS NOT TRUE");
    expect(compiled.text).not.toContain("ST_MakeEnvelope");
  });

  it("flags the Cuba longitude-sign issue without mutating coordinates", () => {
    const assessment = assessCoordinate(row({ genetic_id: "CDE005.AG", group_id: "Cuba_Ceramic.AG", longitude: 77.844 }));
    expect(assessment.ok).toBe(false);
    expect(assessment.reason).toMatch(/longitude sign/i);
    expect(assessment.suggestedLongitude).toBe(-77.844);
  });

  it("uses aggregate G | n labels only when smart mode combines nearby groups", () => {
    const combined = buildSmartFeatures(
      [row({ id: "1", group_id: "G1" }), row({ id: "2", genetic_id: "S2", group_id: "G2" })],
      "default",
      { west: -90, south: 15, east: -70, north: 30 },
      viewport,
      2,
      true
    );
    expect(combined.features).toHaveLength(1);
    expect(combined.features[0].properties.kind).toBe("aggregate");
    expect(combined.features[0].properties.label).toBe("2 | 2");

    const separated = buildSmartFeatures(
      [row({ id: "1", group_id: "G1" }), row({ id: "2", genetic_id: "S2", group_id: "G2" })],
      "default",
      { west: -90, south: 15, east: -70, north: 30 },
      viewport,
      2,
      false
    );
    expect(separated.features.every((feature) => feature.properties.kind === "group")).toBe(true);
  });

  it("displaces overlapping group markers and draws solid leader lines", () => {
    const groupData = buildGroupFeatures(
      [row({ id: "1", group_id: "G1" }), row({ id: "2", genetic_id: "S2", group_id: "G2" })],
      "default"
    );
    const laidOut = applyMapLayout(groupData.features, groupData.leaderLines, worldBounds, viewport);
    const coordinates = laidOut.features.map((feature) => feature.geometry.coordinates.join(","));

    expect(new Set(coordinates).size).toBe(2);
    expect(laidOut.features.every((feature) => feature.properties.label === "1")).toBe(true);
    expect(laidOut.leaderLines.some((line) => line.properties.lineStyle === "solid")).toBe(true);
  });

  it("displaces overlapping samples without sample labels or leader lines", () => {
    const sampleData = buildSampleFeatures(
      [row({ id: "1", group_id: "G1" }), row({ id: "2", genetic_id: "S2", group_id: "G1" })],
      "default"
    );
    const laidOut = applyMapLayout(sampleData.features, sampleData.leaderLines, worldBounds, viewport);
    const coordinates = laidOut.features.map((feature) => feature.geometry.coordinates.join(","));

    expect(new Set(coordinates).size).toBe(2);
    expect(laidOut.features.every((feature) => feature.properties.label === "")).toBe(true);
    expect(laidOut.leaderLines).toHaveLength(0);
  });
});
