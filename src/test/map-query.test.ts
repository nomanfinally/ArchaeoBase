import { describe, expect, it } from "vitest";
import { assessCoordinate } from "@/lib/map/coordinate-sanity";
import {
  buildAnchoredMapPositions,
  prepareMapCache,
  UNKNOWN_COLOR,
  type MapCacheSourceRow
} from "@/lib/map/cache";
import { buildMapSampleWhere } from "@/lib/map/query";

function row(overrides: Partial<MapCacheSourceRow>): MapCacheSourceRow {
  return {
    id: "1",
    release_id: "7",
    row_number: 1,
    genetic_id: "S1",
    group_id: "G1",
    locality: "Site",
    political_entity: "Cuba",
    date_mean_bp: 3850,
    date_mean_year_ce: -1900,
    coverage_1150k: 0.5,
    snp_2m: 1000,
    snp_1240k: 1000,
    molecular_sex: "M",
    y_hap_isogg: null,
    y_hap_terminal: null,
    mtdna_haplogroup: null,
    data_type: "1240k",
    assessment: null,
    has_coordinates: true,
    latitude: 21.5,
    longitude: -77.8,
    ...overrides
  };
}

describe("map cache helpers", () => {
  it("compiles map filters without viewport bounds", () => {
    const compiled = buildMapSampleWhere(
      {
        filter: { type: "condition", field: "political_entity", operator: "equals", value: "Cuba" },
        bounds: { west: -90, south: 15, east: -70, north: 30 },
        zoom: 10
      },
      "7",
      { requireCoordinates: true, bounds: { west: -90, south: 15, east: -70, north: 30 } }
    );

    expect(compiled.text).toContain("s.release_id = $1");
    expect(compiled.text).toContain("s.political_entity = $2");
    expect(compiled.text).toContain("sc.coordinate_status = 'ok'");
    expect(compiled.text).not.toContain("ST_MakeEnvelope");
    expect(compiled.params).toEqual(["7", "Cuba"]);
  });

  it("keeps missing-coordinate samples separate from mapped queries", () => {
    const compiled = buildMapSampleWhere({}, "7", { missingCoordinates: true });
    expect(compiled.text).toContain("s.release_id = $1");
    expect(compiled.text).toContain("sc.coordinate_status = 'missing'");
  });

  it("flags the Cuba longitude-sign issue without mutating coordinates", () => {
    const assessment = assessCoordinate(row({ genetic_id: "CDE005.AG", group_id: "Cuba_Ceramic.AG", longitude: 77.844 }));
    expect(assessment.ok).toBe(false);
    expect(assessment.reason).toMatch(/longitude sign/i);
    expect(assessment.suggestedLongitude).toBe(-77.844);
  });

  it("creates deterministic anchored positions for identical coordinates", () => {
    const points = [
      { id: "G1:S1", latitude: 21.5, longitude: -77.8 },
      { id: "G1:S2", latitude: 21.5, longitude: -77.8 },
      { id: "G1:S3", latitude: 21.5, longitude: -77.8 }
    ];
    const options = { anchorZoom: 15.5, spacingPx: 12, maxOffsetM: 1200, offsetScale: 1 };
    const first = buildAnchoredMapPositions(points, options);
    const second = buildAnchoredMapPositions(points, options);

    expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
    expect(new Set(Array.from(first.values()).map((point) => `${point.latitude.toFixed(8)},${point.longitude.toFixed(8)}`)).size).toBe(3);
  });

  it("preserves the cluster centroid after applying offsets", () => {
    const points = [
      { id: "S1", latitude: 21.5, longitude: -77.8 },
      { id: "S2", latitude: 21.5, longitude: -77.8 },
      { id: "S3", latitude: 21.5, longitude: -77.8 },
      { id: "S4", latitude: 21.5, longitude: -77.8 }
    ];
    const positioned = Array.from(buildAnchoredMapPositions(points, { anchorZoom: 15.5, spacingPx: 12, maxOffsetM: 1200, offsetScale: 1 }).values());
    const avgLat = positioned.reduce((total, point) => total + point.latitude, 0) / positioned.length;
    const avgLon = positioned.reduce((total, point) => total + point.longitude, 0) / positioned.length;

    expect(avgLat).toBeCloseTo(21.5, 6);
    expect(avgLon).toBeCloseTo(-77.8, 6);
  });

  it("uses offset scale to control separation", () => {
    const points = [
      { id: "S1", latitude: 21.5, longitude: -77.8 },
      { id: "S2", latitude: 21.5, longitude: -77.8 }
    ];
    const small = Array.from(buildAnchoredMapPositions(points, { anchorZoom: 15.5, spacingPx: 12, maxOffsetM: 1200, offsetScale: 0.5 }).values());
    const large = Array.from(buildAnchoredMapPositions(points, { anchorZoom: 15.5, spacingPx: 12, maxOffsetM: 1200, offsetScale: 2 }).values());
    const smallSpread = Math.abs(small[0].longitude - small[1].longitude) + Math.abs(small[0].latitude - small[1].latitude);
    const largeSpread = Math.abs(large[0].longitude - large[1].longitude) + Math.abs(large[0].latitude - large[1].latitude);

    expect(largeSpread).toBeGreaterThan(smallSpread);
  });

  it("prepares stable sample cache rows and legends", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "S1", molecular_sex: "M", y_hap_terminal: "R1b", date_mean_bp: 3850 }),
      row({ id: "2", genetic_id: "S2", molecular_sex: "F", y_hap_terminal: "J2", date_mean_bp: 3050 }),
      row({ id: "3", genetic_id: "S3", molecular_sex: null, y_hap_terminal: null, mtdna_haplogroup: null, date_mean_bp: null })
    ]);

    expect(prepared.samples).toHaveLength(3);
    expect(prepared.samples.every((sample) => sample.coordinate_status === "ok")).toBe(true);
    expect(prepared.samples.some((sample) => sample.period_label.includes("older"))).toBe(false);
    expect(prepared.samples.some((sample) => sample.period_label.includes("younger"))).toBe(false);
    expect(prepared.samples.find((sample) => sample.sex_label === "Unknown")?.sex_color_light).toBe(UNKNOWN_COLOR);

    const sexLegend = prepared.legends.filter((legend) => legend.color_mode === "fixed" && legend.color_field === "sex" && legend.theme === "light");
    expect(sexLegend.map((legend) => legend.label)).toEqual(expect.arrayContaining(["Male", "Female", "Unknown"]));

    const gradientLegend = prepared.legends.find((legend) => legend.color_mode === "gradient" && legend.color_field === "date_mean_bp" && legend.theme === "light");
    expect(gradientLegend?.legend_kind).toBe("gradient");
    expect(gradientLegend?.stops).toContain("color");
  });

  it("excludes suspicious coordinates from normal cached display positions", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "CDE005.AG", group_id: "Cuba_Ceramic.AG", longitude: 77.844 })
    ]);

    expect(prepared.samples[0].coordinate_status).toBe("issue");
    expect(prepared.samples[0].display_latitude).toBeNull();
    expect(prepared.groups).toHaveLength(0);
  });
});
