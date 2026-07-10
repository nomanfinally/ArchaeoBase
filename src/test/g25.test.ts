import { describe, expect, it } from "vitest";
import {
  buildG25FallbackName,
  formatG25Line,
  G25_DIMENSION_COUNT,
  inferGeneticIdFromG25Name,
  parseG25CsvRows
} from "@/lib/g25";

function coordinateValues() {
  return Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => ((index + 1) / 1000).toFixed(6));
}

describe("G25 helpers", () => {
  it("infers genetic IDs from ordinary G25 coordinate names", () => {
    expect(inferGeneticIdFromG25Name("China_Henan_Zhengzhou_Xisima_LateShang:05XGS-M20__BC_1148__Cov_65.80%")).toBe("05XGS-M20");
    expect(inferGeneticIdFromG25Name("I1234")).toBe("I1234");
  });

  it("builds fallback coordinate names from group and genetic IDs", () => {
    expect(buildG25FallbackName("Group A", "Sample,1")).toBe("Group_A:Sample_1");
    expect(buildG25FallbackName("", "I1234")).toBe("I1234");
  });

  it("formats a full G25 line as one value with 25 coordinate slots", () => {
    const line = formatG25Line("Group:I1", [0.1, null, -0.2]);
    expect(line.startsWith("Group:I1,0.1,,-0.2,")).toBe(true);
    expect(line.split(",")).toHaveLength(26);
  });

  it("parses headerless G25 rows", () => {
    const [row] = parseG25CsvRows([
      "China_Henan_Zhengzhou_Xisima_LateShang:05XGS-M20__BC_1148__Cov_65.80%",
      ...coordinateValues()
    ].join(","));

    expect(row.coordsName).toBe("China_Henan_Zhengzhou_Xisima_LateShang:05XGS-M20__BC_1148__Cov_65.80%");
    expect(row.geneticId).toBe("05XGS-M20");
    expect(row.coordinates).toHaveLength(25);
    expect(row.coordinates[0]).toBe(0.001);
    expect(row.coordinates[24]).toBe(0.025);
  });

  it("parses headered rows with source metadata and empty coordinate slots", () => {
    const header = ["coords_name", "genetic_id", "source", ...Array.from({ length: 25 }, (_, index) => `PC${index + 1}`)];
    const line = ["Manual:Sample1", "Sample1", "My sheet", ...Array.from({ length: 25 }, () => "")];
    const [row] = parseG25CsvRows(`${header.join(",")}\n${line.join(",")}`);

    expect(row.coordsName).toBe("Manual:Sample1");
    expect(row.geneticId).toBe("Sample1");
    expect(row.source).toBe("My sheet");
    expect(row.coordinates.every((coordinate) => coordinate === null)).toBe(true);
  });

  it("parses property sheets with a single quoted G25 column", () => {
    const g25Line = ["Group1:Sample1__BC_1000__Cov_50.00%", ...coordinateValues()].join(",");
    const [row] = parseG25CsvRows(`Genetic ID,Group ID,G25,G25 Source\nSample1,Group1,"${g25Line}",manual`);

    expect(row.coordsName).toBe("Group1:Sample1__BC_1000__Cov_50.00%");
    expect(row.geneticId).toBe("Sample1");
    expect(row.source).toBe("manual");
    expect(row.coordinates).toHaveLength(25);
    expect(row.coordinates[1]).toBe(0.002);
  });

  it("skips property-sheet rows with empty G25 cells", () => {
    expect(parseG25CsvRows("Genetic ID,Group ID,G25\nSample1,Group1,")).toEqual([]);
  });
});
