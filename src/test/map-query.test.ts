import { describe, expect, it } from "vitest";
import { assessCoordinate } from "@/lib/map/coordinate-sanity";
import { periodInfo } from "@/lib/periods";
import {
  buildAnchoredMapPositions,
  prepareMapCache,
  UNKNOWN_COLOR,
  type MapCacheSourceRow
} from "@/lib/map/cache";
import { buildMapSampleWhere, buildSampleFeatures } from "@/lib/map/query";

function row(overrides: Partial<MapCacheSourceRow>): MapCacheSourceRow {
  return {
    id: "1",
    release_id: "7",
    row_number: 1,
    genetic_id: "S1",
    group_id: "G1",
    locality: "Site",
    political_entity: "Cuba",
    regions: null,
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
    suffixes: null,
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
    const ageStops = JSON.parse(gradientLegend?.stops ?? "[]") as Array<{ value: number; color: string }>;
    expect(ageStops[0].value).toBe(3850);
    expect(ageStops[ageStops.length - 1]?.value).toBe(0);
    expect(ageStops[0].color).not.toBe(ageStops[ageStops.length - 1]?.color);
  });

  it("uses triangle marker shapes only for Modern sample features", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "Modern", date_mean_bp: 100 }),
      row({ id: "2", genetic_id: "Bronze", date_mean_bp: 4000 })
    ]);
    const { features } = buildSampleFeatures(prepared.samples, {
      mode: "fixed",
      fixedBy: "period",
      gradientBy: "date_mean_bp",
      theme: "light"
    });

    expect(features.find((feature) => feature.properties.title === "Modern")?.properties.markerShape).toBe("triangle");
    expect(features.find((feature) => feature.properties.title === "Bronze")?.properties.markerShape).toBe("circle");
  });

  it("keeps haplogroup non-data reasons separate from real initials", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "S1", y_hap_isogg: "n/a (female)", y_hap_terminal: "R1b", mtdna_haplogroup: "n/a (<2x)" }),
      row({ id: "2", genetic_id: "S2", y_hap_isogg: "R1b1a1", mtdna_haplogroup: "H1" })
    ]);

    expect(prepared.samples[0].y_haplogroup_initial_label).toBe("No Y-DNA (female)");
    expect(prepared.samples[0].y_haplogroup_initial_color_light).not.toBe(UNKNOWN_COLOR);
    expect(prepared.samples[0].y_haplogroup_initial_color_dark).not.toBe("#ff1493");
    expect(prepared.samples[0].mtdna_initial_label).toBe("mtDNA n/a (<2x)");
    expect(prepared.samples[0].mtdna_initial_color_light).not.toBe(UNKNOWN_COLOR);
    expect(prepared.samples[0].mtdna_initial_color_dark).not.toBe("#e879f9");
    expect(prepared.samples[1].y_haplogroup_initial_label).toBe("R");
    expect(prepared.samples[1].mtdna_initial_label).toBe("H");
  });

  it("uses aDNA-focused period boundaries from numeric BP values", () => {
    expect(periodInfo(11500).label).toBe("Mesolithic (Early)");
    expect(periodInfo(9000).label).toBe("Mesolithic (Late)");
    expect(periodInfo(7600).label).toBe("Neolithic (EN)");
    expect(periodInfo(7000).label).toBe("Neolithic (MN)");
    expect(periodInfo(6500).label).toBe("Neolithic (LN)");
    expect(periodInfo(5800).label).toBe("Chalcolithic");
    expect(periodInfo(5000).label).toBe("Bronze Age (EBA)");
    expect(periodInfo(4000).label).toBe("Bronze Age (MBA)");
    expect(periodInfo(3700).label).toBe("Bronze Age (MLBA)");
    expect(periodInfo(3300).label).toBe("Bronze Age (LBA)");
    expect(periodInfo(2800).label).toBe("Iron Age");
    expect(periodInfo(53950).label).toBe("Paleolithic");
    expect(periodInfo(65000).label).toBe("Unknown");
  });

  it("keeps categorical period colors separated between Bronze Age and Modern", () => {
    const bronzePeriods = [5000, 4000, 3700, 3300].map((dateMeanBp) => periodInfo(dateMeanBp));
    const modern = periodInfo(100);

    expect(modern.label).toBe("Modern");
    expect(modern.light).toBe("#16a34a");
    expect(bronzePeriods.map((period) => period.label)).toEqual([
      "Bronze Age (EBA)",
      "Bronze Age (MBA)",
      "Bronze Age (MLBA)",
      "Bronze Age (LBA)"
    ]);
    expect(bronzePeriods.some((period) => period.light === modern.light || period.dark === modern.dark)).toBe(false);
    expect(new Set(bronzePeriods.map((period) => period.light)).size).toBe(bronzePeriods.length);
  });

  it("builds the split Age BP legend with broad period segments", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "P1", date_mean_bp: 30000 }),
      row({ id: "2", genetic_id: "M1", date_mean_bp: 9000 }),
      row({ id: "3", genetic_id: "N1", date_mean_bp: 6500 }),
      row({ id: "4", genetic_id: "B1", date_mean_bp: 3700 }),
      row({ id: "5", genetic_id: "I1", date_mean_bp: 2500 })
    ]);

    const splitLegend = prepared.legends.find((legend) => legend.color_mode === "gradient" && legend.color_field === "smart_date_mean_bp" && legend.theme === "light");
    const segments = JSON.parse(splitLegend?.segments ?? "[]") as Array<{ label: string; subLabel?: string; marks?: string[] }>;
    expect(splitLegend?.label).toBe("Age BP (split)");
    expect(segments.map((segment) => segment.label)).toEqual([
      "Paleolithic-Mesolithic",
      "Neolithic-Chalcolithic",
      "Bronze Age",
      "Iron Age-Modern"
    ]);
    expect(segments.find((segment) => segment.label === "Bronze Age")?.subLabel).toContain("MLBA");
    expect(segments.find((segment) => segment.label === "Bronze Age")?.marks).toEqual(["EBA", "MBA", "MLBA", "LBA"]);
  });

  it("assigns stable population-cluster colors and allows distant color reuse", () => {
    const prepared = prepareMapCache([
      row({ id: "1", genetic_id: "A1", group_id: "Near_A", latitude: 45, longitude: 10 }),
      row({ id: "2", genetic_id: "B1", group_id: "Near_B", latitude: 45.1, longitude: 10.1 }),
      row({ id: "3", genetic_id: "C1", group_id: "Far_C", latitude: -35, longitude: -65 }),
      row({ id: "4", genetic_id: "P1", group_id: "Turkmenistan_C_Parkhai.AG", suffixes: "AG", latitude: 38, longitude: 58 }),
      row({ id: "5", genetic_id: "P2", group_id: "Turkmenistan_C_Parkhai.TW", suffixes: "TW", latitude: 38.1, longitude: 58.1 }),
      row({ id: "6", genetic_id: "P3", group_id: "Turkmenistan_C_Parkhai.AG.TW", suffixes: "AG.TW", latitude: 38.2, longitude: 58.2 })
    ]);

    const nearA = prepared.samples.find((sample) => sample.group_id === "Near_A");
    const nearB = prepared.samples.find((sample) => sample.group_id === "Near_B");
    const farC = prepared.samples.find((sample) => sample.group_id === "Far_C");
    const parkhai = prepared.samples.filter((sample) => sample.group_cluster_label === "Turkmenistan_C_Parkhai");
    expect(nearA?.group_cluster_label).toBe("Near_A");
    expect(nearB?.group_cluster_label).toBe("Near_B");
    expect(nearA?.group_cluster_color_dark).not.toBe(nearB?.group_cluster_color_dark);
    expect(farC?.group_cluster_color_dark).toMatch(/^#/);
    expect(parkhai).toHaveLength(3);
    expect(new Set(parkhai.map((sample) => sample.group_cluster_color_dark)).size).toBe(1);

    const clusterLegend = prepared.legends.filter((legend) => legend.color_mode === "fixed" && legend.color_field === "group_cluster" && legend.theme === "dark");
    expect(clusterLegend.length).toBeLessThanOrEqual(12);
    expect(clusterLegend.every((legend) => /^Color \d+$/.test(legend.label))).toBe(true);
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
