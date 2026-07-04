import type { Pool, PoolClient } from "pg";
import { assessCoordinate } from "./coordinate-sanity";
import type { MapColorBy, MapColorTheme, MapGradientBy } from "./types";

export const MAP_CACHE_DEFAULTS = {
  offsetScale: 5,
  sampleAnchorZoom: 13.25,
  groupAnchorZoom: 12.9,
  sampleSpacingPx: 16,
  groupSpacingPx: 22,
  maxSampleOffsetM: 18000,
  maxGroupOffsetM: 24000,
  sameSiteRadiusKm: 25,
  groupOutlierLinkKm: 75
};

export const UNKNOWN_COLOR = "#000000";

export const fixedColorFields: MapColorBy[] = [
  "single",
  "sex",
  "data_type",
  "y_haplogroup_initial",
  "mtdna_initial",
  "period"
];

export const gradientColorFields: MapGradientBy[] = [
  "snp_1240k",
  "snp_2m",
  "coverage_1150k",
  "date_mean_bp"
];

type CoordinateStatus = "ok" | "missing" | "issue";

export type MapRebuildOptions = Partial<typeof MAP_CACHE_DEFAULTS> & {
  releaseId?: string | number | null;
};

export type MapCacheSourceRow = {
  id: string | number;
  release_id: string | number;
  row_number: number;
  genetic_id: string | null;
  group_id: string | null;
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
  has_coordinates: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type SampleMapCacheRecord = {
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
  has_coordinates: boolean;
  coordinate_status: CoordinateStatus;
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
};

export type GroupMapCacheRecord = {
  group_site_key: string;
  release_id: string;
  group_id: string | null;
  site_cluster_id: string;
  full_sample_count: number;
  centroid_latitude: number;
  centroid_longitude: number;
  display_latitude: number;
  display_longitude: number;
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
};

type LegendRecord = {
  release_id: string;
  color_mode: "fixed" | "gradient";
  color_field: string;
  theme: MapColorTheme;
  legend_kind: "categorical" | "gradient";
  label: string;
  color: string | null;
  count: number;
  sort_order: number;
  min_value: number | null;
  max_value: number | null;
  stops: string | null;
  ticks: string | null;
  unknown_count: number;
};

type WorkingSample = MapCacheSourceRow & {
  sample_id: string;
  release_id_text: string;
  group_site_key: string | null;
  site_cluster_id: string | null;
  coordinate_status: CoordinateStatus;
  coordinate_issue_reason: string | null;
  suggested_latitude: number | null;
  suggested_longitude: number | null;
  display_latitude: number | null;
  display_longitude: number | null;
  is_spatial_outlier: boolean;
  outlier_target_latitude: number | null;
  outlier_target_longitude: number | null;
};

type SiteCluster = {
  groupKey: string;
  groupId: string | null;
  siteIndex: number;
  siteClusterId: string;
  groupSiteKey: string;
  rows: WorkingSample[];
  latitude: number;
  longitude: number;
  isOutlier: boolean;
  outlierTargetLatitude: number | null;
  outlierTargetLongitude: number | null;
  displayLatitude: number;
  displayLongitude: number;
};

type GradientDomain = {
  min: number;
  max: number;
  stops: number[];
};

const EARTH_RADIUS_M = 6378137;
const WEB_MERCATOR_WORLD_M = 2 * Math.PI * EARTH_RADIUS_M;
const GOLDEN_ANGLE_DEGREES = 137.50776405003785;

const categoricalPaletteLight = [
  "#386cb0",
  "#bb4f8f",
  "#2f6f4f",
  "#c49a2c",
  "#6d5798",
  "#24706b",
  "#a55f22",
  "#9d3f4f",
  "#667085",
  "#256f86",
  "#7a6b1f",
  "#7c5f45"
];

const categoricalPaletteDark = [
  "#38bdf8",
  "#ff1493",
  "#22d3a6",
  "#facc15",
  "#c084fc",
  "#2dd4bf",
  "#fb923c",
  "#fb7185",
  "#cbd5e1",
  "#67e8f9",
  "#fde047",
  "#fda4af"
];

const DATE_MEAN_BP_GRADIENT_MAX = 60000;

const periodBuckets = [
  { label: "Paleolithic", startYear: -300000, endYear: -10000, light: "#334e68", dark: "#8fb7ff" },
  { label: "Mesolithic", startYear: -10000, endYear: -8000, light: "#7f1d5a", dark: "#ff4fb3" },
  { label: "Neolithic", startYear: -8000, endYear: -4500, light: "#2f6f4f", dark: "#35e6a9" },
  { label: "Chalcolithic", startYear: -4500, endYear: -3300, light: "#8a6f2a", dark: "#f5d547" },
  { label: "Bronze Age", startYear: -3300, endYear: -1200, light: "#9a3412", dark: "#fb923c" },
  { label: "Iron Age", startYear: -1200, endYear: -500, light: "#5b4b8a", dark: "#c4b5fd" },
  { label: "Classical", startYear: -500, endYear: 500, light: "#0f766e", dark: "#2dd4bf" },
  { label: "Medieval", startYear: 500, endYear: 1500, light: "#be185d", dark: "#f472b6" },
  { label: "Modern", startYear: 1500, endYear: 3000, light: "#475569", dark: "#94a3b8" }
];

function mergedOptions(options: MapRebuildOptions = {}) {
  return { ...MAP_CACHE_DEFAULTS, ...options };
}

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
  return String(value);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
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

function firstHaplogroupLetter(value: string | null) {
  const match = asText(value).trim().match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "Unknown";
}

function groupKey(row: { id: string | number; genetic_id: string | null; group_id: string | null }) {
  return row.group_id || `No group ID:${row.genetic_id ?? row.id}`;
}

function stableSortKey(row: { id: string | number; genetic_id: string | null; group_id: string | null }) {
  return `${row.group_id ?? ""}:${row.genetic_id ?? ""}:${row.id}`;
}

function mercatorFromLonLat(longitude: number, latitude: number) {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const x = (longitude * Math.PI * EARTH_RADIUS_M) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + (clampedLatitude * Math.PI) / 360)) * EARTH_RADIUS_M;
  return { x, y };
}

function lonLatFromMercator(x: number, y: number) {
  return {
    longitude: (x * 180) / (Math.PI * EARTH_RADIUS_M),
    latitude: (Math.atan(Math.sinh(y / EARTH_RADIUS_M)) * 180) / Math.PI
  };
}

export function metersPerPixelAtZoom(zoom: number) {
  return WEB_MERCATOR_WORLD_M / (256 * 2 ** zoom);
}

export type AnchorPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export function buildAnchoredMapPositions(
  points: AnchorPoint[],
  options: { anchorZoom: number; spacingPx: number; maxOffsetM: number; offsetScale?: number }
) {
  const spacingM = metersPerPixelAtZoom(options.anchorZoom) * options.spacingPx * (options.offsetScale ?? 1);
  const clusterRadiusM = Math.max(1, spacingM);
  const projected = points
    .map((point) => ({ ...point, ...mercatorFromLonLat(point.longitude, point.latitude) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  type Cluster = {
    points: typeof projected;
    sumX: number;
    sumY: number;
    centroidX: number;
    centroidY: number;
    cellX: number;
    cellY: number;
  };

  const clusters: Cluster[] = [];
  const buckets = new Map<string, Cluster[]>();
  const cellKey = (cellX: number, cellY: number) => `${cellX}:${cellY}`;

  for (const point of projected) {
    const cellX = Math.floor(point.x / clusterRadiusM);
    const cellY = Math.floor(point.y / clusterRadiusM);
    let selected: Cluster | null = null;

    for (let dx = -1; dx <= 1 && !selected; dx += 1) {
      for (let dy = -1; dy <= 1 && !selected; dy += 1) {
        const nearby = buckets.get(cellKey(cellX + dx, cellY + dy)) ?? [];
        selected = nearby.find((cluster) => Math.hypot(point.x - cluster.centroidX, point.y - cluster.centroidY) <= clusterRadiusM) ?? null;
      }
    }

    if (selected) {
      selected.points.push(point);
      selected.sumX += point.x;
      selected.sumY += point.y;
      selected.centroidX = selected.sumX / selected.points.length;
      selected.centroidY = selected.sumY / selected.points.length;
    } else {
      const cluster = {
        points: [point],
        sumX: point.x,
        sumY: point.y,
        centroidX: point.x,
        centroidY: point.y,
        cellX,
        cellY
      };
      clusters.push(cluster);
      const key = cellKey(cellX, cellY);
      const current = buckets.get(key);
      if (current) current.push(cluster);
      else buckets.set(key, [cluster]);
    }
  }

  const positions = new Map<string, { latitude: number; longitude: number; clusterSize: number; offsetM: number }>();
  for (const cluster of clusters) {
    const rawOffsets = cluster.points.map((point, index) => {
      if (cluster.points.length === 1) return { id: point.id, dx: 0, dy: 0 };
      const seed = hashText(point.id) % 360;
      const radius = Math.min(options.maxOffsetM, Math.sqrt(index) * spacingM);
      const angle = ((index * GOLDEN_ANGLE_DEGREES + seed) * Math.PI) / 180;
      return {
        id: point.id,
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius
      };
    });

    const meanDx = rawOffsets.reduce((total, offset) => total + offset.dx, 0) / rawOffsets.length;
    const meanDy = rawOffsets.reduce((total, offset) => total + offset.dy, 0) / rawOffsets.length;

    for (const point of cluster.points) {
      const offset = rawOffsets.find((candidate) => candidate.id === point.id) ?? { dx: 0, dy: 0 };
      const centeredDx = offset.dx - meanDx;
      const centeredDy = offset.dy - meanDy;
      const display = lonLatFromMercator(point.x + centeredDx, point.y + centeredDy);
      positions.set(point.id, {
        latitude: display.latitude,
        longitude: display.longitude,
        clusterSize: cluster.points.length,
        offsetM: Math.hypot(centeredDx, centeredDy)
      });
    }
  }

  return positions;
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radiusKm = 6371;
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const lat1 = a.latitude * toRad;
  const lat2 = b.latitude * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function averageCoordinate(rows: Array<{ latitude: number | null; longitude: number | null }>) {
  const points = rows.filter((row) => row.latitude !== null && row.longitude !== null) as Array<{ latitude: number; longitude: number }>;
  return {
    latitude: points.reduce((total, row) => total + row.latitude, 0) / points.length,
    longitude: points.reduce((total, row) => total + row.longitude, 0) / points.length
  };
}

function siteClustersForGroup(groupRows: WorkingSample[], options: ReturnType<typeof mergedOptions>) {
  const clusters: Array<{ rows: WorkingSample[]; latitude: number; longitude: number }> = [];
  const sortedRows = [...groupRows].sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));

  for (const row of sortedRows) {
    if (row.latitude === null || row.longitude === null) continue;
    const matching = clusters.find((cluster) => haversineKm({ latitude: row.latitude ?? 0, longitude: row.longitude ?? 0 }, cluster) <= options.sameSiteRadiusKm);
    if (matching) {
      matching.rows.push(row);
      const average = averageCoordinate(matching.rows);
      matching.latitude = average.latitude;
      matching.longitude = average.longitude;
    } else {
      clusters.push({ rows: [row], latitude: row.latitude, longitude: row.longitude });
    }
  }

  const primary = [...clusters].sort((a, b) => b.rows.length - a.rows.length || a.latitude - b.latitude || a.longitude - b.longitude)[0];
  return clusters.map((cluster, index) => {
    const distanceToPrimary = primary ? haversineKm(cluster, primary) : 0;
    return {
      rows: cluster.rows,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      siteIndex: index,
      isOutlier: Boolean(primary && cluster !== primary && distanceToPrimary >= options.groupOutlierLinkKm),
      outlierTargetLatitude: primary && cluster !== primary ? primary.latitude : null,
      outlierTargetLongitude: primary && cluster !== primary ? primary.longitude : null
    };
  });
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
  return `#${[r, g, b].map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`;
}

function interpolateColor(stops: string[], normalized: number) {
  const clamped = Math.max(0, Math.min(1, normalized));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = hexToRgb(stops[index]);
  const b = hexToRgb(stops[index + 1]);
  return rgbToHex(a.r + (b.r - a.r) * local, a.g + (b.g - a.g) * local, a.b + (b.b - a.b) * local);
}

function colorForCategory(label: string, field: MapColorBy, theme: MapColorTheme) {
  if (label === "Unknown") return UNKNOWN_COLOR;
  if (field === "single") return theme === "dark" ? "#22d3a6" : "#2f6f4f";
  if (field === "sex") {
    if (label === "Male") return theme === "dark" ? "#38bdf8" : "#386cb0";
    if (label === "Female") return theme === "dark" ? "#ff1493" : "#bb4f8f";
  }
  const palette = theme === "dark" ? categoricalPaletteDark : categoricalPaletteLight;
  return palette[hashText(`${field}:${label}`) % palette.length];
}

export function fixedLabelForRow(row: Pick<MapCacheSourceRow, "molecular_sex" | "data_type" | "y_hap_terminal" | "y_hap_isogg" | "mtdna_haplogroup" | "date_mean_bp">, field: MapColorBy) {
  if (field === "single") return "Matched samples";
  if (field === "sex") return normalizeSex(row.molecular_sex);
  if (field === "data_type") return asText(row.data_type) || "Unknown";
  if (field === "y_haplogroup_initial") return firstHaplogroupLetter(asText(row.y_hap_isogg) || asText(row.y_hap_terminal));
  if (field === "mtdna_initial") return firstHaplogroupLetter(row.mtdna_haplogroup);
  return periodInfo(row.date_mean_bp).label;
}

function periodInfo(dateMeanBp: number | null) {
  if (dateMeanBp === null || !Number.isFinite(dateMeanBp)) {
    return { label: "Unknown", sort: 999, light: UNKNOWN_COLOR, dark: UNKNOWN_COLOR };
  }
  const year = 1950 - dateMeanBp;
  const bucket = periodBuckets.find((candidate) => year >= candidate.startYear && year < candidate.endYear);
  if (!bucket) return { label: "Unknown", sort: 999, light: UNKNOWN_COLOR, dark: UNKNOWN_COLOR };
  return {
    label: bucket.label,
    sort: periodBuckets.indexOf(bucket),
    light: bucket.light,
    dark: bucket.dark
  };
}

function fixedColorInfo(row: Pick<MapCacheSourceRow, "molecular_sex" | "data_type" | "y_hap_terminal" | "y_hap_isogg" | "mtdna_haplogroup" | "date_mean_bp">, field: MapColorBy) {
  if (field === "period") {
    const period = periodInfo(row.date_mean_bp);
    return { label: period.label, light: period.light, dark: period.dark, sort: period.sort };
  }
  const label = fixedLabelForRow(row, field);
  return {
    label,
    light: colorForCategory(label, field, "light"),
    dark: colorForCategory(label, field, "dark"),
    sort: label === "Unknown" ? 999 : hashText(label)
  };
}

const gradientFallbackDomains: Record<MapGradientBy, GradientDomain> = {
  snp_1240k: { min: 0, max: 1200000, stops: [0, 300000, 600000, 900000, 1200000] },
  snp_2m: { min: 0, max: 2000000, stops: [0, 500000, 1000000, 1500000, 2000000] },
  coverage_1150k: { min: 0, max: 5, stops: [0, 0.5, 1, 2.5, 5] },
  date_mean_bp: { min: 0, max: 45000, stops: [0, 5000, 10000, 20000, 45000] }
};

function gradientValue(row: Pick<MapCacheSourceRow, "snp_1240k" | "snp_2m" | "coverage_1150k" | "date_mean_bp">, field: MapGradientBy) {
  return asNumber(row[field]);
}

export function gradientColor(value: number | null, field: MapGradientBy, theme: MapColorTheme, domain: GradientDomain) {
  if (value === null) return UNKNOWN_COLOR;
  const stopValues = domain.stops.length >= 2 ? domain.stops : [domain.min, domain.max];
  const palette = gradientPalette(field, theme);
  if (value <= stopValues[0]) return colorAtStopIndex(0, stopValues.length, palette);
  if (value >= stopValues[stopValues.length - 1]) return colorAtStopIndex(stopValues.length - 1, stopValues.length, palette);

  for (let index = 0; index < stopValues.length - 1; index += 1) {
    const start = stopValues[index];
    const end = stopValues[index + 1];
    if (value < start || value > end) continue;
    const local = (value - start) / Math.max(0.000001, end - start);
    return interpolateColor(
      [colorAtStopIndex(index, stopValues.length, palette), colorAtStopIndex(index + 1, stopValues.length, palette)],
      local
    );
  }

  return colorAtStopIndex(stopValues.length - 1, stopValues.length, palette);
}

function gradientPalette(field: MapGradientBy, theme: MapColorTheme) {
  if (field === "date_mean_bp") {
    return theme === "dark"
      ? ["#38bdf8", "#22d3ee", "#facc15", "#fb923c", "#ff1744"]
      : ["#2563eb", "#16a34a", "#facc15", "#f97316", "#dc2626"];
  }
  if (field === "coverage_1150k") {
    return theme === "dark"
      ? ["#94a3b8", "#38bdf8", "#22d3a6", "#facc15", "#ff1493"]
      : ["#64748b", "#2563eb", "#10b981", "#f59e0b", "#dc2626"];
  }
  return theme === "dark"
    ? ["#c084fc", "#38bdf8", "#22d3a6", "#facc15", "#fb923c"]
    : ["#6d28d9", "#2563eb", "#0891b2", "#16a34a", "#f59e0b"];
}

function colorAtStopIndex(index: number, total: number, palette: string[]) {
  if (total <= 1) return palette[0];
  return interpolateColor(palette, index / (total - 1));
}

function quantile(sortedValues: number[], q: number) {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];
  if (next === undefined) return sortedValues[base];
  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function uniqueStops(values: number[], fallback: GradientDomain) {
  const stops = Array.from(new Set(values.map((value) => Number(value.toFixed(6))))).sort((a, b) => a - b);
  if (stops.length >= 2) return stops;
  return fallback.stops;
}

function gradientDomains(rows: MapCacheSourceRow[]) {
  const domains = {} as Record<MapGradientBy, GradientDomain>;
  for (const field of gradientColorFields) {
    const values = rows
      .map((row) => gradientValue(row, field))
      .filter((value): value is number => value !== null)
      .map((value) => (field === "date_mean_bp" ? Math.max(0, value) : value))
      .filter((value) => field !== "date_mean_bp" || value <= DATE_MEAN_BP_GRADIENT_MAX);
    if (!values.length) {
      domains[field] = gradientFallbackDomains[field];
      continue;
    }
    const sortedValues = [...values].sort((a, b) => a - b);
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const quantileStops = uniqueStops(
      [0, 0.25, 0.5, 0.75, 1].map((q) => quantile(sortedValues, q)),
      gradientFallbackDomains[field]
    );
    domains[field] = max > min
      ? { min, max, stops: quantileStops }
      : { min: 0, max: Math.max(max, gradientFallbackDomains[field].max), stops: gradientFallbackDomains[field].stops };
  }
  return domains;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatGradientTick(value: number, field: MapGradientBy) {
  if (field === "coverage_1150k") return value.toFixed(value >= 1 ? 1 : 2);
  if (field === "date_mean_bp") return `${formatInteger(value)} BP`;
  return formatInteger(value);
}

function gradientTitle(field: MapGradientBy) {
  if (field === "snp_1240k") return "SNPs 1240k";
  if (field === "snp_2m") return "SNPs 2M";
  if (field === "coverage_1150k") return "Coverage 1.15M";
  return "Age BP";
}

function gradientStops(field: MapGradientBy, theme: MapColorTheme, domain: GradientDomain) {
  return domain.stops.map((value) => {
    return {
      value,
      label: formatGradientTick(value, field),
      color: gradientColor(value, field, theme, domain)
    };
  });
}

function aggregateNumeric<T>(rows: T[], getter: (row: T) => number | null) {
  const values = rows.map(getter).filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function mixedFixedColorInfo(rows: MapCacheSourceRow[], field: MapColorBy) {
  const labels = Array.from(new Set(rows.map((row) => fixedLabelForRow(row, field))));
  if (labels.length > 1) {
    return {
      label: "Mixed group",
      light: "#4b5563",
      dark: "#d1d5db",
      sort: 998
    };
  }
  return fixedColorInfo(rows[0], field);
}

function attachGroupSites(samples: WorkingSample[], options: ReturnType<typeof mergedOptions>) {
  const byGroup = new Map<string, WorkingSample[]>();
  for (const sample of samples.filter((row) => row.coordinate_status === "ok")) {
    const key = groupKey(sample);
    const current = byGroup.get(key);
    if (current) current.push(sample);
    else byGroup.set(key, [sample]);
  }

  const sites: SiteCluster[] = [];
  for (const [key, rows] of byGroup) {
    const clusters = siteClustersForGroup(rows, options);
    clusters.forEach((cluster, index) => {
      const siteClusterId = String(index);
      const groupSiteKey = `${key}::${siteClusterId}`;
      cluster.rows.forEach((row) => {
        row.site_cluster_id = siteClusterId;
        row.group_site_key = groupSiteKey;
        row.is_spatial_outlier = cluster.isOutlier;
        row.outlier_target_latitude = cluster.outlierTargetLatitude;
        row.outlier_target_longitude = cluster.outlierTargetLongitude;
      });
      sites.push({
        groupKey: key,
        groupId: rows[0]?.group_id ?? null,
        siteIndex: index,
        siteClusterId,
        groupSiteKey,
        rows: cluster.rows,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        isOutlier: cluster.isOutlier,
        outlierTargetLatitude: cluster.outlierTargetLatitude,
        outlierTargetLongitude: cluster.outlierTargetLongitude,
        displayLatitude: cluster.latitude,
        displayLongitude: cluster.longitude
      });
    });
  }

  return sites;
}

function cacheRecordForSample(row: WorkingSample, domains: Record<MapGradientBy, GradientDomain>): SampleMapCacheRecord {
  const single = fixedColorInfo(row, "single");
  const sex = fixedColorInfo(row, "sex");
  const dataType = fixedColorInfo(row, "data_type");
  const yDna = fixedColorInfo(row, "y_haplogroup_initial");
  const mtDna = fixedColorInfo(row, "mtdna_initial");
  const period = fixedColorInfo(row, "period");
  const snp1240k = gradientValue(row, "snp_1240k");
  const snp2m = gradientValue(row, "snp_2m");
  const coverage = gradientValue(row, "coverage_1150k");
  const dateBp = gradientValue(row, "date_mean_bp");

  return {
    sample_id: row.sample_id,
    release_id: row.release_id_text,
    row_number: row.row_number,
    genetic_id: row.genetic_id,
    group_id: row.group_id,
    group_site_key: row.group_site_key,
    locality: row.locality,
    political_entity: row.political_entity,
    date_mean_bp: row.date_mean_bp,
    date_mean_year_ce: row.date_mean_year_ce,
    coverage_1150k: row.coverage_1150k,
    snp_2m: row.snp_2m,
    snp_1240k: row.snp_1240k,
    molecular_sex: row.molecular_sex,
    y_hap_isogg: row.y_hap_isogg,
    y_hap_terminal: row.y_hap_terminal,
    mtdna_haplogroup: row.mtdna_haplogroup,
    data_type: row.data_type,
    assessment: row.assessment,
    has_coordinates: row.has_coordinates,
    coordinate_status: row.coordinate_status,
    coordinate_issue_reason: row.coordinate_issue_reason,
    suggested_latitude: row.suggested_latitude,
    suggested_longitude: row.suggested_longitude,
    original_latitude: row.latitude,
    original_longitude: row.longitude,
    display_latitude: row.display_latitude,
    display_longitude: row.display_longitude,
    site_cluster_id: row.site_cluster_id,
    is_spatial_outlier: row.is_spatial_outlier,
    outlier_target_latitude: row.outlier_target_latitude,
    outlier_target_longitude: row.outlier_target_longitude,
    single_label: single.label,
    single_color_light: single.light,
    single_color_dark: single.dark,
    sex_label: sex.label,
    sex_color_light: sex.light,
    sex_color_dark: sex.dark,
    data_type_label: dataType.label,
    data_type_color_light: dataType.light,
    data_type_color_dark: dataType.dark,
    y_haplogroup_initial_label: yDna.label,
    y_haplogroup_initial_color_light: yDna.light,
    y_haplogroup_initial_color_dark: yDna.dark,
    mtdna_initial_label: mtDna.label,
    mtdna_initial_color_light: mtDna.light,
    mtdna_initial_color_dark: mtDna.dark,
    period_label: period.label,
    period_sort: period.sort,
    period_color_light: period.light,
    period_color_dark: period.dark,
    gradient_snp_1240k_value: snp1240k,
    gradient_snp_1240k_color_light: gradientColor(snp1240k, "snp_1240k", "light", domains.snp_1240k),
    gradient_snp_1240k_color_dark: gradientColor(snp1240k, "snp_1240k", "dark", domains.snp_1240k),
    gradient_snp_2m_value: snp2m,
    gradient_snp_2m_color_light: gradientColor(snp2m, "snp_2m", "light", domains.snp_2m),
    gradient_snp_2m_color_dark: gradientColor(snp2m, "snp_2m", "dark", domains.snp_2m),
    gradient_coverage_1150k_value: coverage,
    gradient_coverage_1150k_color_light: gradientColor(coverage, "coverage_1150k", "light", domains.coverage_1150k),
    gradient_coverage_1150k_color_dark: gradientColor(coverage, "coverage_1150k", "dark", domains.coverage_1150k),
    gradient_date_mean_bp_value: dateBp,
    gradient_date_mean_bp_color_light: gradientColor(dateBp, "date_mean_bp", "light", domains.date_mean_bp),
    gradient_date_mean_bp_color_dark: gradientColor(dateBp, "date_mean_bp", "dark", domains.date_mean_bp)
  };
}

function cacheRecordForGroup(site: SiteCluster, releaseId: string, domains: Record<MapGradientBy, GradientDomain>): GroupMapCacheRecord {
  const sourceRows = site.rows as MapCacheSourceRow[];
  const single = mixedFixedColorInfo(sourceRows, "single");
  const sex = mixedFixedColorInfo(sourceRows, "sex");
  const dataType = mixedFixedColorInfo(sourceRows, "data_type");
  const yDna = mixedFixedColorInfo(sourceRows, "y_haplogroup_initial");
  const mtDna = mixedFixedColorInfo(sourceRows, "mtdna_initial");
  const period = mixedFixedColorInfo(sourceRows, "period");
  const snp1240k = aggregateNumeric(sourceRows, (row) => gradientValue(row, "snp_1240k"));
  const snp2m = aggregateNumeric(sourceRows, (row) => gradientValue(row, "snp_2m"));
  const coverage = aggregateNumeric(sourceRows, (row) => gradientValue(row, "coverage_1150k"));
  const dateBp = aggregateNumeric(sourceRows, (row) => gradientValue(row, "date_mean_bp"));

  return {
    group_site_key: site.groupSiteKey,
    release_id: releaseId,
    group_id: site.groupId,
    site_cluster_id: site.siteClusterId,
    full_sample_count: site.rows.length,
    centroid_latitude: site.latitude,
    centroid_longitude: site.longitude,
    display_latitude: site.displayLatitude,
    display_longitude: site.displayLongitude,
    is_spatial_outlier: site.isOutlier,
    outlier_target_latitude: site.outlierTargetLatitude,
    outlier_target_longitude: site.outlierTargetLongitude,
    single_label: single.label,
    single_color_light: single.light,
    single_color_dark: single.dark,
    sex_label: sex.label,
    sex_color_light: sex.light,
    sex_color_dark: sex.dark,
    data_type_label: dataType.label,
    data_type_color_light: dataType.light,
    data_type_color_dark: dataType.dark,
    y_haplogroup_initial_label: yDna.label,
    y_haplogroup_initial_color_light: yDna.light,
    y_haplogroup_initial_color_dark: yDna.dark,
    mtdna_initial_label: mtDna.label,
    mtdna_initial_color_light: mtDna.light,
    mtdna_initial_color_dark: mtDna.dark,
    period_label: period.label,
    period_sort: period.sort,
    period_color_light: period.light,
    period_color_dark: period.dark,
    gradient_snp_1240k_value: snp1240k,
    gradient_snp_1240k_color_light: gradientColor(snp1240k, "snp_1240k", "light", domains.snp_1240k),
    gradient_snp_1240k_color_dark: gradientColor(snp1240k, "snp_1240k", "dark", domains.snp_1240k),
    gradient_snp_2m_value: snp2m,
    gradient_snp_2m_color_light: gradientColor(snp2m, "snp_2m", "light", domains.snp_2m),
    gradient_snp_2m_color_dark: gradientColor(snp2m, "snp_2m", "dark", domains.snp_2m),
    gradient_coverage_1150k_value: coverage,
    gradient_coverage_1150k_color_light: gradientColor(coverage, "coverage_1150k", "light", domains.coverage_1150k),
    gradient_coverage_1150k_color_dark: gradientColor(coverage, "coverage_1150k", "dark", domains.coverage_1150k),
    gradient_date_mean_bp_value: dateBp,
    gradient_date_mean_bp_color_light: gradientColor(dateBp, "date_mean_bp", "light", domains.date_mean_bp),
    gradient_date_mean_bp_color_dark: gradientColor(dateBp, "date_mean_bp", "dark", domains.date_mean_bp)
  };
}

function buildLegendRows(releaseId: string, samples: SampleMapCacheRecord[], domains: Record<MapGradientBy, GradientDomain>): LegendRecord[] {
  const rows: LegendRecord[] = [];

  for (const field of fixedColorFields) {
    for (const theme of ["light", "dark"] as MapColorTheme[]) {
      const labelColumn = `${field}_label` as keyof SampleMapCacheRecord;
      const colorColumn = `${field}_color_${theme}` as keyof SampleMapCacheRecord;
      const counts = new Map<string, { color: string; count: number; sort: number }>();
      for (const sample of samples) {
        const label = String(sample[labelColumn] ?? "Unknown");
        const color = String(sample[colorColumn] ?? UNKNOWN_COLOR);
        const current = counts.get(label);
        if (current) {
          current.count += 1;
        } else {
          counts.set(label, {
            color,
            count: 1,
            sort: field === "period" ? sample.period_sort : label === "Unknown" ? 999999 : hashText(label)
          });
        }
      }

      Array.from(counts.entries())
        .sort(([labelA, a], [labelB, b]) => a.sort - b.sort || labelA.localeCompare(labelB))
        .forEach(([label, item], index) => {
          rows.push({
            release_id: releaseId,
            color_mode: "fixed",
            color_field: field,
            theme,
            legend_kind: "categorical",
            label,
            color: item.color,
            count: item.count,
            sort_order: index,
            min_value: null,
            max_value: null,
            stops: null,
            ticks: null,
            unknown_count: label === "Unknown" ? item.count : 0
          });
        });
    }
  }

  for (const field of gradientColorFields) {
    const unknownCount = samples.filter((sample) => sample[`gradient_${field}_value` as keyof SampleMapCacheRecord] === null).length;
    for (const theme of ["light", "dark"] as MapColorTheme[]) {
      const domain = domains[field];
      const stops = gradientStops(field, theme, domain);
      const ticks = stops.map(({ value, label }) => ({ value, label }));
      rows.push({
        release_id: releaseId,
        color_mode: "gradient",
        color_field: field,
        theme,
        legend_kind: "gradient",
        label: gradientTitle(field),
        color: null,
        count: samples.length - unknownCount,
        sort_order: 0,
        min_value: domain.min,
        max_value: domain.max,
        stops: JSON.stringify(stops),
        ticks: JSON.stringify(ticks),
        unknown_count: unknownCount
      });
    }
  }

  return rows;
}

export function prepareMapCache(rows: MapCacheSourceRow[], options: MapRebuildOptions = {}) {
  const settings = mergedOptions(options);
  const releaseId = rows[0] ? String(rows[0].release_id) : String(options.releaseId ?? "");
  const domains = gradientDomains(rows);
  const workingRows: WorkingSample[] = rows
    .map((row) => {
      const hasCoordinates = Boolean(row.has_coordinates && row.latitude !== null && row.longitude !== null);
      const assessment = hasCoordinates ? assessCoordinate(row) : { ok: false, reason: "Missing coordinate", suggestedLatitude: null, suggestedLongitude: null };
      const coordinateStatus: CoordinateStatus = !hasCoordinates ? "missing" : assessment.ok ? "ok" : "issue";
      return {
        ...row,
        sample_id: String(row.id),
        release_id_text: String(row.release_id),
        group_site_key: null,
        site_cluster_id: null,
        coordinate_status: coordinateStatus,
        coordinate_issue_reason: coordinateStatus === "issue" ? assessment.reason : null,
        suggested_latitude: coordinateStatus === "issue" ? assessment.suggestedLatitude : null,
        suggested_longitude: coordinateStatus === "issue" ? assessment.suggestedLongitude : null,
        display_latitude: coordinateStatus === "ok" ? row.latitude : null,
        display_longitude: coordinateStatus === "ok" ? row.longitude : null,
        is_spatial_outlier: false,
        outlier_target_latitude: null,
        outlier_target_longitude: null
      };
    })
    .sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));

  const safeRows = workingRows.filter((row) => row.coordinate_status === "ok" && row.latitude !== null && row.longitude !== null);
  const samplePositions = buildAnchoredMapPositions(
    safeRows.map((row) => ({ id: row.sample_id, latitude: row.latitude ?? 0, longitude: row.longitude ?? 0 })),
    {
      anchorZoom: settings.sampleAnchorZoom,
      spacingPx: settings.sampleSpacingPx,
      maxOffsetM: settings.maxSampleOffsetM,
      offsetScale: settings.offsetScale
    }
  );

  for (const row of safeRows) {
    const display = samplePositions.get(row.sample_id);
    if (!display) continue;
    row.display_latitude = display.latitude;
    row.display_longitude = display.longitude;
  }

  const sites = attachGroupSites(workingRows, settings);
  const sitePositions = buildAnchoredMapPositions(
    sites.map((site) => ({ id: site.groupSiteKey, latitude: site.latitude, longitude: site.longitude })),
    {
      anchorZoom: settings.groupAnchorZoom,
      spacingPx: settings.groupSpacingPx,
      maxOffsetM: settings.maxGroupOffsetM,
      offsetScale: settings.offsetScale
    }
  );
  for (const site of sites) {
    const display = sitePositions.get(site.groupSiteKey);
    if (!display) continue;
    site.displayLatitude = display.latitude;
    site.displayLongitude = display.longitude;
  }

  const samples = workingRows.map((row) => cacheRecordForSample(row, domains));
  const groups = sites.map((site) => cacheRecordForGroup(site, releaseId, domains));
  const legends = buildLegendRows(releaseId, samples, domains);

  return { samples, groups, legends };
}

const sampleCacheColumns: Array<keyof SampleMapCacheRecord> = [
  "sample_id",
  "release_id",
  "row_number",
  "genetic_id",
  "group_id",
  "group_site_key",
  "locality",
  "political_entity",
  "date_mean_bp",
  "date_mean_year_ce",
  "coverage_1150k",
  "snp_2m",
  "snp_1240k",
  "molecular_sex",
  "y_hap_isogg",
  "y_hap_terminal",
  "mtdna_haplogroup",
  "data_type",
  "assessment",
  "has_coordinates",
  "coordinate_status",
  "coordinate_issue_reason",
  "suggested_latitude",
  "suggested_longitude",
  "original_latitude",
  "original_longitude",
  "display_latitude",
  "display_longitude",
  "site_cluster_id",
  "is_spatial_outlier",
  "outlier_target_latitude",
  "outlier_target_longitude",
  "single_label",
  "single_color_light",
  "single_color_dark",
  "sex_label",
  "sex_color_light",
  "sex_color_dark",
  "data_type_label",
  "data_type_color_light",
  "data_type_color_dark",
  "y_haplogroup_initial_label",
  "y_haplogroup_initial_color_light",
  "y_haplogroup_initial_color_dark",
  "mtdna_initial_label",
  "mtdna_initial_color_light",
  "mtdna_initial_color_dark",
  "period_label",
  "period_sort",
  "period_color_light",
  "period_color_dark",
  "gradient_snp_1240k_value",
  "gradient_snp_1240k_color_light",
  "gradient_snp_1240k_color_dark",
  "gradient_snp_2m_value",
  "gradient_snp_2m_color_light",
  "gradient_snp_2m_color_dark",
  "gradient_coverage_1150k_value",
  "gradient_coverage_1150k_color_light",
  "gradient_coverage_1150k_color_dark",
  "gradient_date_mean_bp_value",
  "gradient_date_mean_bp_color_light",
  "gradient_date_mean_bp_color_dark"
];

const groupCacheColumns: Array<keyof GroupMapCacheRecord> = [
  "group_site_key",
  "release_id",
  "group_id",
  "site_cluster_id",
  "full_sample_count",
  "centroid_latitude",
  "centroid_longitude",
  "display_latitude",
  "display_longitude",
  "is_spatial_outlier",
  "outlier_target_latitude",
  "outlier_target_longitude",
  "single_label",
  "single_color_light",
  "single_color_dark",
  "sex_label",
  "sex_color_light",
  "sex_color_dark",
  "data_type_label",
  "data_type_color_light",
  "data_type_color_dark",
  "y_haplogroup_initial_label",
  "y_haplogroup_initial_color_light",
  "y_haplogroup_initial_color_dark",
  "mtdna_initial_label",
  "mtdna_initial_color_light",
  "mtdna_initial_color_dark",
  "period_label",
  "period_sort",
  "period_color_light",
  "period_color_dark",
  "gradient_snp_1240k_value",
  "gradient_snp_1240k_color_light",
  "gradient_snp_1240k_color_dark",
  "gradient_snp_2m_value",
  "gradient_snp_2m_color_light",
  "gradient_snp_2m_color_dark",
  "gradient_coverage_1150k_value",
  "gradient_coverage_1150k_color_light",
  "gradient_coverage_1150k_color_dark",
  "gradient_date_mean_bp_value",
  "gradient_date_mean_bp_color_light",
  "gradient_date_mean_bp_color_dark"
];

const legendColumns: Array<keyof LegendRecord> = [
  "release_id",
  "color_mode",
  "color_field",
  "theme",
  "legend_kind",
  "label",
  "color",
  "count",
  "sort_order",
  "min_value",
  "max_value",
  "stops",
  "ticks",
  "unknown_count"
];

async function insertRows<T extends Record<string, unknown>>(client: Pool | PoolClient, table: string, columns: string[], rows: T[]) {
  if (!rows.length) return;
  const batchSize = Math.max(1, Math.floor(55000 / columns.length));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const params: unknown[] = [];
    const values = batch.map((row) => {
      const placeholders = columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}`,
      params
    );
  }
}

export async function rebuildMapCache(pool: Pool, options: MapRebuildOptions = {}) {
  const settings = mergedOptions(options);
  const releaseResult = settings.releaseId
    ? { rows: [{ id: String(settings.releaseId) }] }
    : await pool.query("SELECT id::text FROM aadr_releases ORDER BY imported_at DESC, id DESC LIMIT 1");
  const releaseIds = releaseResult.rows.map((row: { id: string }) => row.id);
  if (!releaseIds.length) return { releases: 0, samples: 0, groups: 0 };

  await pool.query("REFRESH MATERIALIZED VIEW sample_map_points");

  let sampleTotal = 0;
  let groupTotal = 0;

  for (const releaseId of releaseIds) {
    const rows = await pool.query<MapCacheSourceRow>(
      `
        SELECT
          id::text,
          release_id::text,
          row_number,
          genetic_id,
          group_id,
          locality,
          political_entity,
          date_mean_bp,
          date_mean_year_ce,
          coverage_1150k,
          snp_2m,
          snp_1240k,
          molecular_sex,
          y_hap_isogg,
          y_hap_terminal,
          mtdna_haplogroup,
          data_type,
          assessment,
          has_coordinates,
          latitude,
          longitude
        FROM samples
        WHERE release_id = $1
        ORDER BY id ASC
      `,
      [releaseId]
    );

    const prepared = prepareMapCache(rows.rows, { ...settings, releaseId });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM map_legend_cache WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM group_map_cache WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM sample_map_cache WHERE release_id = $1", [releaseId]);
      await insertRows(client, "sample_map_cache", sampleCacheColumns as string[], prepared.samples as unknown as Record<string, unknown>[]);
      await insertRows(client, "group_map_cache", groupCacheColumns as string[], prepared.groups as unknown as Record<string, unknown>[]);
      await insertRows(client, "map_legend_cache", legendColumns as string[], prepared.legends as unknown as Record<string, unknown>[]);
      await client.query(
        `
          UPDATE sample_map_cache
          SET
            display_geom = CASE
              WHEN display_latitude IS NOT NULL AND display_longitude IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(display_longitude, display_latitude), 4326)
              ELSE NULL
            END,
            display_geom_webmercator = CASE
              WHEN display_latitude IS NOT NULL AND display_longitude IS NOT NULL
              THEN ST_Transform(ST_SetSRID(ST_MakePoint(display_longitude, display_latitude), 4326), 3857)::geometry(Point, 3857)
              ELSE NULL
            END
          WHERE release_id = $1
        `,
        [releaseId]
      );
      await client.query(
        `
          UPDATE group_map_cache
          SET
            display_geom = ST_SetSRID(ST_MakePoint(display_longitude, display_latitude), 4326),
            display_geom_webmercator = ST_Transform(ST_SetSRID(ST_MakePoint(display_longitude, display_latitude), 4326), 3857)::geometry(Point, 3857)
          WHERE release_id = $1
        `,
        [releaseId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    sampleTotal += prepared.samples.length;
    groupTotal += prepared.groups.length;
  }

  return { releases: releaseIds.length, samples: sampleTotal, groups: groupTotal };
}
