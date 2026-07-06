import { describe, expect, it } from "vitest";
import { aggregateUniqueGroupRows } from "@/lib/export/group-aggregation";

describe("unique group CSV export aggregation", () => {
  it("combines sample rows by group ID", () => {
    const rows = [
      {
        group_id: "G1",
        genetic_id: "S1",
        y_hap_isogg: "R1b",
        mtdna_haplogroup: "H",
        period: "Bronze Age",
        political_entity: "Turkey",
        molecular_sex: "M",
        locality: "Site A",
        suffixes: "1240k",
        publication: "Paper A",
        doi: "10/a",
        latitude: 40,
        longitude: 30,
        snp_1240k: 100,
        snp_2m: 200,
        date_mean_bp: 4000,
        date_mean_year_ce: -2050
      },
      {
        group_id: "G1",
        genetic_id: "S2",
        y_hap_isogg: "R1b",
        mtdna_haplogroup: "U5",
        period: "Bronze Age",
        political_entity: "Turkey",
        molecular_sex: "F",
        locality: "Site A",
        suffixes: "Shotgun",
        publication: "Paper B",
        doi: "10/b",
        latitude: 40,
        longitude: 30,
        snp_1240k: 300,
        snp_2m: 400,
        date_mean_bp: 4100,
        date_mean_year_ce: -2150
      },
      {
        group_id: "G1",
        genetic_id: "S3",
        latitude: 41,
        longitude: 31,
        snp_1240k: 500,
        snp_2m: 600,
        date_mean_bp: 4200,
        date_mean_year_ce: -2250
      },
      {
        group_id: "G1",
        genetic_id: "S4",
        snp_1240k: 700,
        snp_2m: 800,
        date_mean_bp: 4300,
        date_mean_year_ce: -2350
      },
      {
        group_id: "G1",
        genetic_id: "S5",
        snp_1240k: 900,
        snp_2m: 1000,
        date_mean_bp: 12000,
        date_mean_year_ce: -10050
      }
    ];

    const [group] = aggregateUniqueGroupRows(rows);
    expect(group.group_id).toBe("G1");
    expect(group.sample_count).toBe(5);
    expect(group.genetic_id).toBe("S1, S2, S3, S4, S5");
    expect(group.y_hap_isogg).toBe("R1b");
    expect(group.mtdna_haplogroup).toBe("H, U5");
    expect(group.molecular_sex).toBe("M, F");
    expect(group.locality).toBe("Site A");
    expect(group.suffixes).toBe("1240k, Shotgun");
    expect(group.publication).toBe("Paper A, Paper B");
    expect(group.doi).toBe("10/a, 10/b");
    expect(group.latitude).toBe("40; 41");
    expect(group.longitude).toBe("30; 31");
    expect(group.snp_1240k_avg).toBe("500");
    expect(group.snp_2m_avg).toBe("600");
    expect(group.date_mean_bp_range).toBe("4000-4300; 12000");
    expect(group.date_mean_bp_avg).toBe("4150; 12000");
    expect(group.date_mean_year_ce_range).toBe("-2350--2050; -10050");
    expect(group.date_mean_year_ce_avg).toBe("-2200; -10050");
  });
});
