import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { getLatestReleaseId, getPool } from "@/lib/db";
import { compileGlobalSearch, compileSampleFilter, mergeWhere } from "@/lib/filters/compile";
import type { MapBounds, SnpCopyState, SnpFilter, SqlFragment } from "@/lib/filters/types";
import {
  buildSnpColorJoin,
  buildSnpFilterSql,
  prepareSnpColor,
  prepareSnpFilters,
  type PreparedSnpColor
} from "@/lib/genotypes/db";
import { haplogroupDisplayValue, UNKNOWN_COLOR } from "./cache";
import { DEFAULT_MAP_SNP_PALETTE, mapSnpPalettes, type MapSnpPalette } from "./types";
import type {
  MapColorBy,
  MapColorMode,
  MapColorTheme,
  MapCoordinateIssue,
  MapGradientBy,
  MapLegend,
  MapLineProperties,
  MapPointProperties,
  MapPresentation,
  MapQueryRequest,
  MapQueryResponse,
  MapUnmappedSample
} from "./types";

export const MAP_RENDER_CONSTANTS = {
  sameSiteRadiusKm: 25,
  groupOutlierLinkKm: 75
};

type MapColorConfig = {
  mode: MapColorMode;
  fixedBy: MapColorBy;
  gradientBy: MapGradientBy;
  theme: MapColorTheme;
  snpColor?: PreparedSnpColor | null;
  snpPalette: MapSnpPalette;
};

type CacheRow = {
  sample_id: string;
  release_id: string;
  row_number: number;
  genetic_id: string | null;
  group_id: string | null;
  group_site_key: string | null;
  locality: string | null;
  political_entity: string | null;
  date_mean_bp: number | null;
  date_mean_year_ce: number | null;
  coverage_1150k: number | null;
  snp_2m: number | null;
  snp_1240k: number | null;
  molecular_sex: string | null;
  y_hap_isogg: string | null;
  y_hap_terminal: string | null;
  mtdna_haplogroup: string | null;
  data_type: string | null;
  assessment: string | null;
  coordinate_status: "ok" | "missing" | "issue";
  coordinate_issue_reason: string | null;
  suggested_latitude: number | null;
  suggested_longitude: number | null;
  original_latitude: number | null;
  original_longitude: number | null;
  display_latitude: number | null;
  display_longitude: number | null;
  site_cluster_id: string | null;
  is_spatial_outlier: boolean;
  outlier_target_latitude: number | null;
  outlier_target_longitude: number | null;
  single_label: string;
  single_color_light: string;
  single_color_dark: string;
  sex_label: string;
  sex_color_light: string;
  sex_color_dark: string;
  data_type_label: string;
  data_type_color_light: string;
  data_type_color_dark: string;
  group_cluster_label: string;
  group_cluster_color_light: string;
  group_cluster_color_dark: string;
  y_haplogroup_initial_label: string;
  y_haplogroup_initial_color_light: string;
  y_haplogroup_initial_color_dark: string;
  mtdna_initial_label: string;
  mtdna_initial_color_light: string;
  mtdna_initial_color_dark: string;
  period_label: string;
  period_sort: number;
  period_color_light: string;
  period_color_dark: string;
  gradient_snp_1240k_value: number | null;
  gradient_snp_1240k_color_light: string;
  gradient_snp_1240k_color_dark: string;
  gradient_snp_2m_value: number | null;
  gradient_snp_2m_color_light: string;
  gradient_snp_2m_color_dark: string;
  gradient_coverage_1150k_value: number | null;
  gradient_coverage_1150k_color_light: string;
  gradient_coverage_1150k_color_dark: string;
  gradient_date_mean_bp_value: number | null;
  gradient_date_mean_bp_color_light: string;
  gradient_date_mean_bp_color_dark: string;
  gradient_smart_date_mean_bp_value: number | null;
  gradient_smart_date_mean_bp_color_light: string;
  gradient_smart_date_mean_bp_color_dark: string;
  group_display_latitude: number | null;
  group_display_longitude: number | null;
  group_centroid_latitude: number | null;
  group_centroid_longitude: number | null;
  group_is_spatial_outlier: boolean | null;
  group_outlier_target_latitude: number | null;
  group_outlier_target_longitude: number | null;
  snp_color_call_code?: number | null;
  snp_color_ref_count?: number | null;
  snp_color_alt_count?: number | null;
  snp_color_is_missing?: boolean | null;
};

type GroupedRows = {
  key: string;
  rows: CacheRow[];
  displayLatitude: number;
  displayLongitude: number;
  centroidLatitude: number;
  centroidLongitude: number;
  isOutlier: boolean;
  outlierTargetLatitude: number | null;
  outlierTargetLongitude: number | null;
};

type LegendCacheRow = {
  legend_kind: "categorical" | "gradient";
  label: string;
  color: string | null;
  count: number;
  min_value: number | null;
  max_value: number | null;
  stops: unknown;
  ticks: unknown;
  segments: unknown;
  unknown_count: number;
};

const UNMAPPED_PREVIEW_LIMIT = 50;
const SNP_COLOR_MISSING = "#111111";

const fixedColumnMap: Record<MapColorBy, { label: keyof CacheRow; light: keyof CacheRow; dark: keyof CacheRow; title: string }> = {
  single: { label: "single_label", light: "single_color_light", dark: "single_color_dark", title: "Single color" },
  sex: { label: "sex_label", light: "sex_color_light", dark: "sex_color_dark", title: "Molecular sex" },
  data_type: { label: "data_type_label", light: "data_type_color_light", dark: "data_type_color_dark", title: "Data type" },
  group_cluster: { label: "group_cluster_label", light: "group_cluster_color_light", dark: "group_cluster_color_dark", title: "Population cluster" },
  y_haplogroup_initial: {
    label: "y_haplogroup_initial_label",
    light: "y_haplogroup_initial_color_light",
    dark: "y_haplogroup_initial_color_dark",
    title: "Y-DNA first letter"
  },
  mtdna_initial: { label: "mtdna_initial_label", light: "mtdna_initial_color_light", dark: "mtdna_initial_color_dark", title: "mtDNA first letter" },
  period: { label: "period_label", light: "period_color_light", dark: "period_color_dark", title: "Period" }
};

const gradientColumnMap: Record<MapGradientBy, { value: keyof CacheRow; light: keyof CacheRow; dark: keyof CacheRow; title: string }> = {
  snp_1240k: { value: "gradient_snp_1240k_value", light: "gradient_snp_1240k_color_light", dark: "gradient_snp_1240k_color_dark", title: "SNPs 1240k" },
  snp_2m: { value: "gradient_snp_2m_value", light: "gradient_snp_2m_color_light", dark: "gradient_snp_2m_color_dark", title: "SNPs 2M" },
  coverage_1150k: {
    value: "gradient_coverage_1150k_value",
    light: "gradient_coverage_1150k_color_light",
    dark: "gradient_coverage_1150k_color_dark",
    title: "Coverage 1.15M"
  },
  date_mean_bp: { value: "gradient_date_mean_bp_value", light: "gradient_date_mean_bp_color_light", dark: "gradient_date_mean_bp_color_dark", title: "Age BP" },
  smart_date_mean_bp: {
    value: "gradient_smart_date_mean_bp_value",
    light: "gradient_smart_date_mean_bp_color_light",
    dark: "gradient_smart_date_mean_bp_color_dark",
    title: "Age BP (split)"
  }
};

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value);
}

function formatInteger(value: unknown) {
  const parsed = asNumber(value);
  return parsed === null ? "" : new Intl.NumberFormat("en-US").format(Math.round(parsed));
}

function formatYear(value: number | null) {
  if (value === null) return "";
  if (value < 0) return `${formatInteger(Math.abs(value))} BCE`;
  return value <= 100 ? `${formatInteger(value)} AD` : `${formatInteger(value)} CE`;
}

function truncateText(value: string, maxLength = 92) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function makeRows(rows: Array<[string, string | number | null | undefined]>) {
  return rows
    .map(([label, value]) => [label, typeof value === "number" ? formatInteger(value) : asText(value)] as [string, string])
    .filter(([, value]) => value);
}

function rowsJson(rows: Array<[string, string | number | null | undefined]>) {
  return JSON.stringify(makeRows(rows));
}

function normalizeSex(value: string | null) {
  const text = asText(value).trim().toLowerCase();
  if (!text) return "Unknown";
  if (text === "m" || text.includes("male")) return "Male";
  if (text === "f" || text.includes("female")) return "Female";
  if (text.includes("m") && !text.includes("f")) return "Male";
  if (text.includes("f") && !text.includes("m")) return "Female";
  return "Unknown";
}

function aggregateNumeric(rows: CacheRow[], field: MapGradientBy) {
  const valueColumn = gradientColumnMap[field].value;
  const values = rows.map((row) => asNumber(row[valueColumn])).filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatGradientValue(value: number | null, field: MapGradientBy) {
  if (value === null) return "Unknown";
  if (field === "coverage_1150k") return value.toFixed(value >= 1 ? 1 : 2);
  if (field === "date_mean_bp" || field === "smart_date_mean_bp") return `${formatInteger(value)} BP`;
  return formatInteger(value);
}

function snpSelectedAlleleCount(row: CacheRow, config: MapColorConfig) {
  if (!config.snpColor) return null;
  if (row.snp_color_is_missing || row.snp_color_call_code === 3) return null;
  const count = config.snpColor.alleleRole === "ref" ? row.snp_color_ref_count : row.snp_color_alt_count;
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

function snpPaletteColors(config: MapColorConfig) {
  return (mapSnpPalettes.find((palette) => palette.id === config.snpPalette) ?? mapSnpPalettes[0]).colors;
}

function snpColorForSelectedCount(count: number, config: MapColorConfig) {
  const colors = snpPaletteColors(config);
  if (count === 2) return colors.two;
  if (count === 1) return colors.one;
  return colors.zero;
}

function snpGenotypeLabelForCallCode(callCode: number | null | undefined, config: MapColorConfig, withSnpId = true) {
  const variant = config.snpColor;
  if (!variant || callCode === null || callCode === undefined || callCode === 3) return "missing";
  const ref = variant.ref_allele ?? "?";
  const alt = variant.alt_allele ?? "?";
  const selected = variant.alleleRole === "ref" ? ref : alt;
  const other = variant.alleleRole === "ref" ? alt : ref;
  const selectedCount = variant.alleleRole === "ref"
    ? callCode === 2 ? 2 : callCode === 1 ? 1 : 0
    : callCode === 0 ? 2 : callCode === 1 ? 1 : 0;
  const genotype = selectedCount === 2 ? `${selected}${selected}` : selectedCount === 1 ? `${selected}${other}` : `${other}${other}`;
  return withSnpId ? `${variant.snp_id} ${genotype}` : genotype;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}

function interpolateHex(startColor: string, endColor: string, amount: number) {
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);
  const clamped = Math.max(0, Math.min(1, amount));
  return rgbToHex(start.r + (end.r - start.r) * clamped, start.g + (end.g - start.g) * clamped, start.b + (end.b - start.b) * clamped);
}

function colorFromGradientLegend(value: number, legend: Extract<MapLegend, { kind: "gradient" }>) {
  const stops = [...legend.stops].filter((stop) => Number.isFinite(stop.value)).sort((a, b) => a.value - b.value);
  if (!stops.length) return UNKNOWN_COLOR;
  if (value <= stops[0].value) return stops[0].color;
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color;

  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];
    if (value < start.value || value > end.value) continue;
    const local = (value - start.value) / Math.max(0.000001, end.value - start.value);
    return interpolateHex(start.color, end.color, local);
  }

  return stops[stops.length - 1].color;
}

function colorInfoForSample(row: CacheRow, config: MapColorConfig) {
  if (config.mode === "snp") {
    const selectedCount = snpSelectedAlleleCount(row, config);
    if (selectedCount === null) {
      return { label: "missing", color: SNP_COLOR_MISSING, isUnknown: true };
    }
    const label = snpGenotypeLabelForCallCode(row.snp_color_call_code, config);
    return { label, color: snpColorForSelectedCount(selectedCount, config), isUnknown: false };
  }

  if (config.mode === "fixed") {
    const columns = fixedColumnMap[config.fixedBy];
    const label = String(row[columns.label] ?? "Unknown");
    const color = String(row[config.theme === "dark" ? columns.dark : columns.light] ?? UNKNOWN_COLOR);
    return { label, color, isUnknown: label === "Unknown" || color === UNKNOWN_COLOR };
  }

  const columns = gradientColumnMap[config.gradientBy];
  const value = asNumber(row[columns.value]);
  const color = String(row[config.theme === "dark" ? columns.dark : columns.light] ?? UNKNOWN_COLOR);
  const label = value === null ? "Unknown" : `${columns.title}: ${formatGradientValue(value, config.gradientBy)}`;
  return { label, color, isUnknown: value === null || color === UNKNOWN_COLOR };
}

function colorInfoForGroup(rows: CacheRow[], config: MapColorConfig, legend: MapLegend) {
  if (config.mode === "snp") {
    const labels = Array.from(new Set(rows.map((row) => colorInfoForSample(row, config).label)));
    if (labels.length > 1) return { label: "Mixed genotype", color: "#6b7280", isUnknown: false };
    return colorInfoForSample(rows[0], config);
  }

  if (config.mode === "fixed") {
    const columns = fixedColumnMap[config.fixedBy];
    const labels = Array.from(new Set(rows.map((row) => String(row[columns.label] ?? "Unknown"))));
    if (labels.length > 1) {
      return { label: "Mixed group", color: config.theme === "dark" ? "#d1d5db" : "#4b5563", isUnknown: false };
    }
    return colorInfoForSample(rows[0], config);
  }

  const value = aggregateNumeric(rows, config.gradientBy);
  if (legend.kind !== "gradient" || value === null) {
    return { label: "Unknown", color: UNKNOWN_COLOR, isUnknown: true };
  }
  const color = colorFromGradientLegend(value, legend);
  return {
    label: `${gradientColumnMap[config.gradientBy].title}: ${formatGradientValue(value, config.gradientBy)}`,
    color,
    isUnknown: color === UNKNOWN_COLOR
  };
}

function sampleDetail(row: CacheRow, colorConfig: MapColorConfig) {
  const geneticId = asText(row.genetic_id);
  const group = asText(row.group_id);
  const title = geneticId || group || "Sample";
  const place = [asText(row.locality), asText(row.political_entity)].filter(Boolean).join(", ");
  const yDna = haplogroupDisplayValue(row.y_hap_isogg, "y", row.molecular_sex);
  const mtDna = haplogroupDisplayValue(row.mtdna_haplogroup, "mtdna", row.molecular_sex);
  const snpRow = sampleSnpPopupRow(row, colorConfig);
  return {
    title,
    subtitle: place,
    popupRows: rowsJson([
      ["Group", group],
      ["Sample", geneticId],
      ["Date", formatYear(asNumber(row.date_mean_year_ce))],
      ["Period", row.period_label],
      ["Sex", normalizeSex(row.molecular_sex)],
      ["Y-DNA", yDna],
      ["mtDNA", mtDna],
      ["SNPs 1240k", row.snp_1240k],
      ["SNPs 2M", row.snp_2m],
      ...(snpRow ? [snpRow] : [])
    ])
  };
}

function groupDetail(groupId: string, rows: CacheRow[], colorConfig: MapColorConfig) {
  const localities = Array.from(new Set(rows.map((row) => asText(row.locality)).filter(Boolean))).sort();
  const countries = Array.from(new Set(rows.map((row) => asText(row.political_entity)).filter(Boolean))).sort();
  const periods = Array.from(new Set(rows.map((row) => asText(row.period_label)).filter(Boolean))).sort();
  const yDna = Array.from(new Set(rows.map((row) => haplogroupDisplayValue(row.y_hap_isogg, "y", row.molecular_sex)))).sort();
  const mtDna = Array.from(new Set(rows.map((row) => haplogroupDisplayValue(row.mtdna_haplogroup, "mtdna", row.molecular_sex)))).sort();
  const years = rows.map((row) => asNumber(row.date_mean_year_ce)).filter((value): value is number => value !== null);
  const snps = rows.map((row) => asNumber(row.snp_1240k)).filter((value): value is number => value !== null);
  const avgSnps = snps.length ? Math.round(snps.reduce((total, value) => total + value, 0) / snps.length) : null;
  const dateText = years.length ? `${formatYear(Math.min(...years))} to ${formatYear(Math.max(...years))}` : "";
  const snpRow = groupSnpPopupRow(rows, colorConfig);
  return {
    title: groupId || "Group",
    subtitle: countries.join(", ") || truncateText(localities.join("; ")),
    popupRows: rowsJson([
      ["Samples", rows.length],
      ["Date span", dateText],
      ["Periods", truncateText(periods.join(", "))],
      ["Countries", truncateText(countries.join(", "))],
      ["Localities", truncateText(localities.join("; "))],
      ["Y-DNA", truncateText(yDna.join(", "))],
      ["mtDNA", truncateText(mtDna.join(", "))],
      ["Avg SNPs 1240k", avgSnps],
      ...(snpRow ? [snpRow] : [])
    ])
  };
}

function sampleSnpPopupRow(row: CacheRow, config: MapColorConfig): [string, string | null] | null {
  if (config.mode !== "snp" || !config.snpColor) return null;
  return [config.snpColor.snp_id, snpGenotypeLabelForCallCode(row.snp_color_call_code, config, false)];
}

function groupSnpPopupRow(rows: CacheRow[], config: MapColorConfig): [string, string | null] | null {
  if (config.mode !== "snp" || !config.snpColor) return null;
  const labels = Array.from(new Set(rows.map((row) => snpGenotypeLabelForCallCode(row.snp_color_call_code, config, false)))).sort();
  return [config.snpColor.snp_id, truncateText(labels.join(", "))];
}

function pointFeature(
  markerId: string,
  kind: MapPointProperties["kind"],
  latitude: number,
  longitude: number,
  originalLatitude: number,
  originalLongitude: number,
  properties: Omit<MapPointProperties, "markerId" | "kind" | "originalLatitude" | "originalLongitude" | "displayLatitude" | "displayLongitude" | "markerShape"> & {
    markerShape?: MapPointProperties["markerShape"];
  }
): Feature<Point, MapPointProperties> {
  const { markerShape = "circle", ...rest } = properties;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      markerId,
      kind,
      originalLatitude,
      originalLongitude,
      displayLatitude: latitude,
      displayLongitude: longitude,
      markerShape,
      ...rest
    }
  };
}

function markerShapeForSample(row: CacheRow): MapPointProperties["markerShape"] {
  return row.period_label === "Modern" ? "triangle" : "circle";
}

function markerShapeForGroup(rows: CacheRow[]): MapPointProperties["markerShape"] {
  return rows.length > 0 && rows.every((row) => row.period_label === "Modern") ? "triangle" : "circle";
}

function centroidColorForGroup(rows: CacheRow[], theme: MapColorTheme) {
  const color = String(rows[0]?.[theme === "dark" ? "group_cluster_color_dark" : "group_cluster_color_light"] ?? UNKNOWN_COLOR);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : UNKNOWN_COLOR;
}

function centroidFeature(group: GroupedRows, color: string): Feature<Point, MapPointProperties> {
  const groupId = group.rows[0]?.group_id || `No group ID:${group.rows[0]?.genetic_id ?? group.key}`;
  return pointFeature(
    `centroid:${group.key}`,
    "centroid",
    group.centroidLatitude,
    group.centroidLongitude,
    group.centroidLatitude,
    group.centroidLongitude,
    {
      label: "",
      sampleCount: group.rows.length,
      groupCount: 1,
      groupId,
      markerColor: color,
      colorLabel: "Group centroid",
      isUnknownColor: color === UNKNOWN_COLOR,
      title: "Group centroid",
      subtitle: groupId,
      popupRows: rowsJson([
        ["Group", groupId],
        ["Samples", group.rows.length]
      ])
    }
  );
}

export function buildSampleFeatures(rows: CacheRow[], colorConfig: MapColorConfig) {
  const features: Array<Feature<Point, MapPointProperties>> = [];
  for (const row of rows) {
    if (row.display_latitude === null || row.display_longitude === null || row.original_latitude === null || row.original_longitude === null) continue;
    const colorInfo = colorInfoForSample(row, colorConfig);
    const detail = sampleDetail(row, colorConfig);
    features.push(
      pointFeature(`sample:${row.sample_id}`, "sample", row.display_latitude, row.display_longitude, row.original_latitude, row.original_longitude, {
        label: "",
        sampleCount: 1,
        groupCount: row.group_id ? 1 : 0,
        groupId: row.group_id ?? "",
        markerColor: colorInfo.color,
        markerShape: markerShapeForSample(row),
        colorLabel: colorInfo.label,
        isUnknownColor: colorInfo.isUnknown,
        ...detail
      })
    );
  }
  for (const group of groupRows(rows)) {
    if (group.rows.length <= 1) continue;
    features.push(centroidFeature(group, centroidColorForGroup(group.rows, colorConfig.theme)));
  }
  return { features, leaderLines: [] as Array<Feature<LineString, MapLineProperties>> };
}

function groupRows(rows: CacheRow[]) {
  const grouped = new Map<string, GroupedRows>();
  for (const row of rows) {
    const key = row.group_site_key || `${row.group_id ?? row.genetic_id ?? row.sample_id}:0`;
    const displayLatitude = row.group_display_latitude ?? row.display_latitude;
    const displayLongitude = row.group_display_longitude ?? row.display_longitude;
    const centroidLatitude = row.group_centroid_latitude ?? row.original_latitude;
    const centroidLongitude = row.group_centroid_longitude ?? row.original_longitude;
    if (displayLatitude === null || displayLongitude === null || centroidLatitude === null || centroidLongitude === null) continue;

    const current = grouped.get(key);
    if (current) {
      current.rows.push(row);
    } else {
      grouped.set(key, {
        key,
        rows: [row],
        displayLatitude,
        displayLongitude,
        centroidLatitude,
        centroidLongitude,
        isOutlier: Boolean(row.group_is_spatial_outlier ?? row.is_spatial_outlier),
        outlierTargetLatitude: row.group_outlier_target_latitude ?? row.outlier_target_latitude,
        outlierTargetLongitude: row.group_outlier_target_longitude ?? row.outlier_target_longitude
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function buildGroupFeatures(rows: CacheRow[], colorConfig: MapColorConfig, legend: MapLegend, showGroupCounts = true) {
  const features: Array<Feature<Point, MapPointProperties>> = [];
  const leaderLines: Array<Feature<LineString, MapLineProperties>> = [];

  for (const group of groupRows(rows)) {
    const first = group.rows[0];
    const groupId = first.group_id || `No group ID:${first.genetic_id ?? first.sample_id}`;
    const colorInfo = colorInfoForGroup(group.rows, colorConfig, legend);
    const detail = groupDetail(groupId, group.rows, colorConfig);
    const markerId = `group:${group.key}`;
    features.push(
      pointFeature(markerId, "group", group.displayLatitude, group.displayLongitude, group.centroidLatitude, group.centroidLongitude, {
        label: showGroupCounts ? String(group.rows.length) : "",
        sampleCount: group.rows.length,
        groupCount: 1,
        groupId,
        markerColor: colorInfo.color,
        markerShape: markerShapeForGroup(group.rows),
        colorLabel: colorInfo.label,
        isUnknownColor: colorInfo.isUnknown,
        ...detail
      })
    );

    if (group.isOutlier && group.outlierTargetLatitude !== null && group.outlierTargetLongitude !== null) {
      leaderLines.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [group.outlierTargetLongitude, group.outlierTargetLatitude],
            [group.centroidLongitude, group.centroidLatitude]
          ]
        },
        properties: {
          lineId: `outlier:${markerId}`,
          kind: "outlier",
          lineStyle: "dashed",
          markerId,
          strokeColor: colorInfo.color
        }
      });
    }

    if (group.rows.length > 1) {
      features.push(centroidFeature(group, centroidColorForGroup(group.rows, colorConfig.theme)));
    }
  }

  return { features, leaderLines };
}

function mapBoundsFragment(_bounds: MapBounds | null | undefined): SqlFragment {
  return { text: "TRUE", params: [] };
}

export function buildMapSampleWhere(
  request: MapQueryRequest,
  releaseId: string,
  options: { requireCoordinates?: boolean; bounds?: MapBounds | null; missingCoordinates?: boolean; coordinateIssues?: boolean } = {}
) {
  const filter = compileSampleFilter(request.filter);
  const globalSearch = compileGlobalSearch(request.globalSearch, request.searchField);
  const releaseFilter: SqlFragment = { text: "s.release_id = $1", params: [releaseId] };
  const coordinateFilter: SqlFragment = options.requireCoordinates
    ? { text: "sc.coordinate_status = 'ok' AND sc.display_latitude IS NOT NULL AND sc.display_longitude IS NOT NULL", params: [] }
    : options.missingCoordinates
      ? { text: "sc.coordinate_status = 'missing'", params: [] }
      : options.coordinateIssues
        ? { text: "sc.coordinate_status = 'issue'", params: [] }
        : { text: "TRUE", params: [] };
  return mergeWhere([releaseFilter, filter, globalSearch, coordinateFilter, mapBoundsFragment(options.bounds)]);
}

function issuePreview(row: CacheRow): MapCoordinateIssue {
  return {
    geneticId: asText(row.genetic_id),
    groupId: asText(row.group_id),
    locality: asText(row.locality),
    politicalEntity: asText(row.political_entity),
    latitude: row.original_latitude ?? 0,
    longitude: row.original_longitude ?? 0,
    reason: row.coordinate_issue_reason ?? "Coordinate needs review",
    suggestedLatitude: row.suggested_latitude,
    suggestedLongitude: row.suggested_longitude
  };
}

function unmappedPreview(row: { genetic_id: string | null; group_id: string | null; locality: string | null; political_entity: string | null }): MapUnmappedSample {
  return {
    geneticId: asText(row.genetic_id),
    groupId: asText(row.group_id),
    locality: asText(row.locality),
    politicalEntity: asText(row.political_entity)
  };
}

function collection<TGeometry extends Point | LineString, TProperties>(features: Array<Feature<TGeometry, TProperties>>): FeatureCollection<TGeometry, TProperties> {
  return { type: "FeatureCollection", features };
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function emptyLegend(config: MapColorConfig): MapLegend {
  if (config.mode === "snp") {
    return {
      kind: "categorical",
      title: "SNP genotype",
      items: [],
      totalItems: 0
    };
  }

  if (config.mode === "gradient") {
    return {
      kind: "gradient",
      title: gradientColumnMap[config.gradientBy].title,
      min: null,
      max: null,
      stops: [],
      ticks: [],
      unknownCount: 0
    };
  }
  return {
    kind: "categorical",
    title: fixedColumnMap[config.fixedBy].title,
    items: [],
    totalItems: 0
  };
}

async function loadLegend(releaseId: string, config: MapColorConfig): Promise<MapLegend> {
  if (config.mode === "snp") return emptyLegend(config);

  const pool = getPool();
  const field = config.mode === "fixed" ? config.fixedBy : config.gradientBy;
  const result = await pool.query<LegendCacheRow>(
    `
      SELECT legend_kind, label, color, count, min_value, max_value, stops, ticks, segments, unknown_count
      FROM map_legend_cache
      WHERE release_id = $1 AND color_mode = $2 AND color_field = $3 AND theme = $4
      ORDER BY sort_order ASC, label ASC
    `,
    [releaseId, config.mode, field, config.theme]
  );

  if (!result.rows.length) return emptyLegend(config);
  const first = result.rows[0];
  if (first.legend_kind === "gradient") {
    return {
      kind: "gradient",
      title: first.label,
      min: first.min_value,
      max: first.max_value,
      stops: parseJsonArray(first.stops),
      ticks: parseJsonArray(first.ticks),
      segments: parseJsonArray(first.segments),
      unknownCount: first.unknown_count ?? 0
    };
  }

  return {
    kind: "categorical",
    title: fixedColumnMap[config.fixedBy].title,
    items: result.rows.map((row) => ({
      label: row.label,
      color: row.color ?? UNKNOWN_COLOR,
      count: row.count ?? 0
    })),
    totalItems: result.rows.length
  };
}

function filteredLegend(cachedLegend: MapLegend, rows: CacheRow[], config: MapColorConfig): MapLegend {
  if (config.mode === "snp") {
    const counts = new Map<string, { color: string; count: number; sort: number }>();
    const sortedLabels = config.snpColor
      ? [0, 1, 2].map((callCode) => snpGenotypeLabelForCallCode(callCode, config))
      : [];
    const sortOrder = new Map([
      [sortedLabels[0], 0],
      [sortedLabels[1], 1],
      [sortedLabels[2], 2],
      ["missing", 3]
    ]);
    for (const row of rows) {
      const info = colorInfoForSample(row, config);
      const current = counts.get(info.label);
      if (current) {
        current.count += 1;
      } else {
        counts.set(info.label, { color: info.color, count: 1, sort: sortOrder.get(info.label) ?? 99 });
      }
    }
    const items = Array.from(counts.entries())
      .sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))
      .map(([label, item]) => ({ label, color: item.color, count: item.count }));
    return {
      kind: "categorical",
      title: "SNP genotype",
      items,
      totalItems: items.length
    };
  }

  if (config.mode === "gradient") {
    if (cachedLegend.kind !== "gradient") return emptyLegend(config);
    const valueColumn = gradientColumnMap[config.gradientBy].value;
    const segments = cachedLegend.segments?.map((segment) => ({
      ...segment,
      count: rows.filter((row) => {
        const value = asNumber(row[valueColumn]);
        if (value === null) return false;
        const lowerOk = segment.min === 0 ? value >= segment.min : value > segment.min;
        return lowerOk && value <= segment.max;
      }).length
    }));
    return {
      ...cachedLegend,
      segments,
      unknownCount: rows.filter((row) => asNumber(row[valueColumn]) === null).length
    };
  }

  const columns = fixedColumnMap[config.fixedBy];
  const colorLegend = new Map<string, { label: string; sort: number }>();
  if (config.fixedBy === "group_cluster" && cachedLegend.kind === "categorical") {
    cachedLegend.items.forEach((item, index) => {
      colorLegend.set(item.color, { label: item.label, sort: index });
    });
  }
  const counts = new Map<string, { color: string; count: number; sort: number }>();
  for (const row of rows) {
    const color = String(row[config.theme === "dark" ? columns.dark : columns.light] ?? UNKNOWN_COLOR);
    const colorEntry = config.fixedBy === "group_cluster" ? colorLegend.get(color) : null;
    const label = colorEntry?.label ?? String(row[columns.label] ?? "Unknown");
    const key = config.fixedBy === "group_cluster" ? color : label;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    counts.set(key, {
      color,
      count: 1,
      sort: config.fixedBy === "period"
        ? asNumber(row.period_sort) ?? 999999
        : colorEntry
          ? colorEntry.sort
          : label === "Unknown"
            ? 999999
            : label.charCodeAt(0)
    });
  }

  const items = Array.from(counts.entries())
    .map(([labelOrColor, item]) => ({
      label: config.fixedBy === "group_cluster" ? colorLegend.get(item.color)?.label ?? labelOrColor : labelOrColor,
      item
    }))
    .sort((a, b) => a.item.sort - b.item.sort || a.label.localeCompare(b.label))
    .map(({ label, item }) => ({ label, color: item.color, count: item.count }));

  return {
    kind: "categorical",
    title: fixedColumnMap[config.fixedBy].title,
    items,
    totalItems: items.length
  };
}

function appendSnpWhere(whereText: string, snpWhereText: string) {
  return snpWhereText === "TRUE" ? whereText : `${whereText} AND ${snpWhereText}`;
}

function mapSnpFiltersForRequest(request: MapQueryRequest): SnpFilter[] {
  const filters = request.snpFilters ?? [];
  if (request.colorMode !== "snp" || !request.includeSnpZeroCopies) return filters;
  const target = request.snpColor ?? filters[0];
  if (!target) return filters;
  let matched = false;
  const expanded = filters.map((filter) => {
    if (filter.snpId !== target.snpId || filter.alleleRole !== target.alleleRole) return filter;
    matched = true;
    const copyStates: SnpCopyState[] = filter.copyStates.includes(0) ? filter.copyStates : [0, ...filter.copyStates];
    return { ...filter, copyStates };
  });
  return matched ? expanded : [...expanded, { snpId: target.snpId, alleleRole: target.alleleRole, copyStates: [0, 1, 2] }];
}

const cacheSelect = `
  sc.sample_id::text,
  sc.release_id::text,
  sc.row_number,
  sc.genetic_id,
  sc.group_id,
  sc.group_site_key,
  sc.locality,
  sc.political_entity,
  sc.date_mean_bp,
  sc.date_mean_year_ce,
  sc.coverage_1150k,
  sc.snp_2m,
  sc.snp_1240k,
  sc.molecular_sex,
  sc.y_hap_isogg,
  sc.y_hap_terminal,
  sc.mtdna_haplogroup,
  sc.data_type,
  sc.assessment,
  sc.coordinate_status,
  sc.coordinate_issue_reason,
  sc.suggested_latitude,
  sc.suggested_longitude,
  sc.original_latitude,
  sc.original_longitude,
  sc.display_latitude,
  sc.display_longitude,
  sc.site_cluster_id,
  sc.is_spatial_outlier,
  sc.outlier_target_latitude,
  sc.outlier_target_longitude,
  sc.single_label,
  sc.single_color_light,
  sc.single_color_dark,
  sc.sex_label,
  sc.sex_color_light,
  sc.sex_color_dark,
  sc.data_type_label,
  sc.data_type_color_light,
  sc.data_type_color_dark,
  sc.group_cluster_label,
  sc.group_cluster_color_light,
  sc.group_cluster_color_dark,
  sc.y_haplogroup_initial_label,
  sc.y_haplogroup_initial_color_light,
  sc.y_haplogroup_initial_color_dark,
  sc.mtdna_initial_label,
  sc.mtdna_initial_color_light,
  sc.mtdna_initial_color_dark,
  sc.period_label,
  sc.period_sort,
  sc.period_color_light,
  sc.period_color_dark,
  sc.gradient_snp_1240k_value,
  sc.gradient_snp_1240k_color_light,
  sc.gradient_snp_1240k_color_dark,
  sc.gradient_snp_2m_value,
  sc.gradient_snp_2m_color_light,
  sc.gradient_snp_2m_color_dark,
  sc.gradient_coverage_1150k_value,
  sc.gradient_coverage_1150k_color_light,
  sc.gradient_coverage_1150k_color_dark,
  sc.gradient_date_mean_bp_value,
  sc.gradient_date_mean_bp_color_light,
  sc.gradient_date_mean_bp_color_dark,
  sc.gradient_smart_date_mean_bp_value,
  sc.gradient_smart_date_mean_bp_color_light,
  sc.gradient_smart_date_mean_bp_color_dark,
  gc.display_latitude AS group_display_latitude,
  gc.display_longitude AS group_display_longitude,
  gc.centroid_latitude AS group_centroid_latitude,
  gc.centroid_longitude AS group_centroid_longitude,
  gc.is_spatial_outlier AS group_is_spatial_outlier,
  gc.outlier_target_latitude AS group_outlier_target_latitude,
  gc.outlier_target_longitude AS group_outlier_target_longitude
`;

export async function runMapQuery(request: MapQueryRequest): Promise<MapQueryResponse> {
  const pool = getPool();
  const release = await getLatestReleaseId();
  const presentation: MapPresentation = request.presentation === "group_locations" ? "group_locations" : "sample_cloud";
  const snpFilters = await prepareSnpFilters(pool, release.id, mapSnpFiltersForRequest(request));
  const requestedColorMode = request.colorMode ?? "fixed";
  const snpColor = requestedColorMode === "snp" ? await prepareSnpColor(pool, release.id, request.snpColor, snpFilters) : null;
  const colorConfig: MapColorConfig = {
    mode: requestedColorMode === "snp" && !snpColor ? "fixed" : requestedColorMode,
    fixedBy: request.colorBy ?? "sex",
    gradientBy: request.gradientBy ?? "snp_1240k",
    theme: request.colorTheme ?? "light",
    snpColor,
    snpPalette: request.snpPalette ?? DEFAULT_MAP_SNP_PALETTE
  };
  const showGroupCounts = request.showGroupCounts !== false;

  const allWhere = buildMapSampleWhere(request, release.id);
  const missingWhere = buildMapSampleWhere(request, release.id, { missingCoordinates: true });
  const issueWhere = buildMapSampleWhere(request, release.id, { coordinateIssues: true });
  const mappedWhere = buildMapSampleWhere(request, release.id, { requireCoordinates: true });
  const allSnpSql = buildSnpFilterSql(snpFilters, allWhere.params.length);
  const missingSnpSql = buildSnpFilterSql(snpFilters, missingWhere.params.length);
  const issueSnpSql = buildSnpFilterSql(snpFilters, issueWhere.params.length);
  const mappedSnpSql = buildSnpFilterSql(snpFilters, mappedWhere.params.length);
  const allWhereText = appendSnpWhere(allWhere.text, allSnpSql.whereText);
  const missingWhereText = appendSnpWhere(missingWhere.text, missingSnpSql.whereText);
  const issueWhereText = appendSnpWhere(issueWhere.text, issueSnpSql.whereText);
  const mappedWhereText = appendSnpWhere(mappedWhere.text, mappedSnpSql.whereText);
  const allParams = [...allWhere.params, ...allSnpSql.params];
  const missingParams = [...missingWhere.params, ...missingSnpSql.params];
  const issueParams = [...issueWhere.params, ...issueSnpSql.params];
  const mappedColorJoin = buildSnpColorJoin(snpColor, mappedWhere.params.length + mappedSnpSql.params.length);
  const mappedParams = [...mappedWhere.params, ...mappedSnpSql.params, ...mappedColorJoin.params];
  const snpColorSelect = mappedColorJoin.alias
    ? `,
  ${mappedColorJoin.alias}.call_code AS snp_color_call_code,
  ${mappedColorJoin.alias}.ref_count AS snp_color_ref_count,
  ${mappedColorJoin.alias}.alt_count AS snp_color_alt_count,
  ${mappedColorJoin.alias}.is_missing AS snp_color_is_missing`
    : "";

  const totalRows = await pool.query(
    `
      SELECT count(*)::integer AS total_matched
      FROM samples s
      ${allSnpSql.joins}
      WHERE ${allWhereText}
    `,
    allParams
  );
  const cacheRows = await pool.query(
    "SELECT count(*)::integer AS cached_samples FROM sample_map_cache WHERE release_id = $1",
    [release.id]
  );
  const totalMatched = totalRows.rows[0]?.total_matched ?? 0;
  const cachedSamples = cacheRows.rows[0]?.cached_samples ?? 0;
  if (totalMatched > 0 && cachedSamples === 0) {
    throw new Error("Map cache is empty. Run npm run db:migrate and npm run db:rebuild-map.");
  }

  const counts = await pool.query(
    `
      SELECT
        count(*)::integer AS total_matched,
        count(*) FILTER (WHERE sc.coordinate_status = 'ok')::integer AS mapped_samples,
        count(*) FILTER (WHERE sc.coordinate_status = 'missing')::integer AS unmapped_samples,
        count(*) FILTER (WHERE sc.coordinate_status = 'issue')::integer AS coordinate_issues
      FROM samples s
      ${allSnpSql.joins}
      LEFT JOIN sample_map_cache sc ON sc.sample_id = s.id
      WHERE ${allWhereText}
    `,
    allParams
  );

  const missingRows = await pool.query(
    `
      SELECT sc.genetic_id, sc.group_id, sc.locality, sc.political_entity
      FROM samples s
      ${missingSnpSql.joins}
      JOIN sample_map_cache sc ON sc.sample_id = s.id
      WHERE ${missingWhereText}
      ORDER BY sc.genetic_id ASC NULLS LAST, sc.sample_id ASC
      LIMIT $${missingParams.length + 1}
    `,
    [...missingParams, UNMAPPED_PREVIEW_LIMIT]
  );

  const issueRows = await pool.query<CacheRow>(
    `
      SELECT ${cacheSelect}
      FROM samples s
      ${issueSnpSql.joins}
      JOIN sample_map_cache sc ON sc.sample_id = s.id
      LEFT JOIN group_map_cache gc ON gc.release_id = sc.release_id AND gc.group_site_key = sc.group_site_key
      WHERE ${issueWhereText}
      ORDER BY sc.genetic_id ASC NULLS LAST, sc.sample_id ASC
      LIMIT $${issueParams.length + 1}
    `,
    [...issueParams, UNMAPPED_PREVIEW_LIMIT]
  );

  const mappedRows = await pool.query<CacheRow>(
    `
      SELECT ${cacheSelect}${snpColorSelect}
      FROM samples s
      ${mappedSnpSql.joins}
      ${mappedColorJoin.join}
      JOIN sample_map_cache sc ON sc.sample_id = s.id
      LEFT JOIN group_map_cache gc ON gc.release_id = sc.release_id AND gc.group_site_key = sc.group_site_key
      WHERE ${mappedWhereText}
      ORDER BY sc.group_id ASC NULLS LAST, sc.genetic_id ASC NULLS LAST, sc.sample_id ASC
    `,
    mappedParams
  );

  const cachedLegend = await loadLegend(release.id, colorConfig);
  const legend = filteredLegend(cachedLegend, mappedRows.rows, colorConfig);
  const renderData = presentation === "group_locations"
    ? buildGroupFeatures(mappedRows.rows, colorConfig, legend, showGroupCounts)
    : buildSampleFeatures(mappedRows.rows, colorConfig);

  const primaryFeatures = renderData.features.filter((feature) => feature.properties.kind !== "centroid");
  const renderedSamples = presentation === "group_locations"
    ? primaryFeatures.reduce((total, feature) => total + feature.properties.sampleCount, 0)
    : primaryFeatures.filter((feature) => feature.properties.kind === "sample").length;
  const renderedGroups = presentation === "group_locations"
    ? primaryFeatures.filter((feature) => feature.properties.kind === "group").length
    : new Set(mappedRows.rows.map((row) => row.group_site_key || row.group_id || row.sample_id)).size;
  const countRow = counts.rows[0] ?? { total_matched: 0, mapped_samples: 0, unmapped_samples: 0, coordinate_issues: 0 };

  return {
    release,
    features: collection(renderData.features),
    leaderLines: collection(renderData.leaderLines),
    legend,
    summary: {
      totalMatched: countRow.total_matched ?? 0,
      mappedSamples: countRow.mapped_samples ?? 0,
      visibleSamples: renderedSamples,
      visibleFeatures: primaryFeatures.length,
      renderedSamples,
      renderedGroups,
      unmappedSamples: countRow.unmapped_samples ?? 0,
      coordinateIssues: countRow.coordinate_issues ?? 0,
      presentation
    },
    unmappedSamples: {
      total: countRow.unmapped_samples ?? 0,
      samples: missingRows.rows.map(unmappedPreview)
    },
    coordinateIssues: {
      total: countRow.coordinate_issues ?? 0,
      samples: issueRows.rows.map(issuePreview)
    }
  };
}
