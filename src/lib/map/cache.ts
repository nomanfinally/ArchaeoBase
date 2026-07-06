import type { Pool, PoolClient } from "pg";
import { periodInfo } from "@/lib/periods";
import { assessCoordinate } from "./coordinate-sanity";
import type { MapColorBy, MapColorTheme, MapGradientBy } from "./types";

export const MAP_CACHE_DEFAULTS = {
  offsetScale: 5.5,
  sampleAnchorZoom: 12.8,
  groupAnchorZoom: 12.4,
  sampleSpacingPx: 17,
  groupSpacingPx: 24,
  maxSampleOffsetM: 28000,
  maxGroupOffsetM: 36000,
  sameSiteRadiusKm: 25,
  groupOutlierLinkKm: 75
};

export const UNKNOWN_COLOR = "#000000";

export const fixedColorFields: MapColorBy[] = [
  "single",
  "sex",
  "data_type",
  "group_cluster",
  "y_haplogroup_initial",
  "mtdna_initial",
  "period"
];

export const gradientColorFields: MapGradientBy[] = [
  "snp_1240k",
  "snp_2m",
  "coverage_1150k",
  "date_mean_bp",
  "smart_date_mean_bp"
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
  regions: string | null;
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
  suffixes: string | null;
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
  regions: string | null;
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
};

export type GroupMapCacheRecord = {
  group_site_key: string;
  release_id: string;
  group_id: string | null;
  regions: string | null;
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
  segments: string | null;
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
  group_cluster_label: string;
  group_cluster_color_light: string;
  group_cluster_color_dark: string;
  group_cluster_sort: number;
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
  segments?: SmartAgeSegment[];
};

type SmartAgeSegment = {
  label: string;
  subLabel?: string;
  marks?: string[];
  min: number;
  max: number;
  startColorLight: string;
  endColorLight: string;
  startColorDark: string;
  endColorDark: string;
  count: number;
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
  "#0ea5e9",
  "#ff1493",
  "#22d3a6",
  "#facc15",
  "#c084fc",
  "#2dd4bf",
  "#fb923c",
  "#fb7185",
  "#475569",
  "#0284c7",
  "#fde047",
  "#fda4af"
];

const groupClusterPalette: Array<{ light: string; dark: string }> = [
  { light: "#2563eb", dark: "#3b82f6" },
  { light: "#be185d", dark: "#ff1493" },
  { light: "#16a34a", dark: "#22c55e" },
  { light: "#ea580c", dark: "#fb923c" },
  { light: "#7c3aed", dark: "#a78bfa" },
  { light: "#0891b2", dark: "#22d3ee" },
  { light: "#dc2626", dark: "#ef4444" },
  { light: "#ca8a04", dark: "#facc15" },
  { light: "#0f766e", dark: "#2dd4bf" },
  { light: "#4f46e5", dark: "#818cf8" },
  { light: "#a21caf", dark: "#d946ef" },
  { light: "#92400e", dark: "#d97706" }
];

const GROUP_CLUSTER_COLOR_RADIUS_KM = 750;
const DATE_MEAN_BP_GRADIENT_MAX = 60000;

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

type HaplogroupKind = "y" | "mtdna";
type HaplogroupMissingReason = "female" | "sex unknown" | "<2x" | "unknown" | "not reported";

const missingHaplogroupPattern =
  /^(?:n\s*\/\s*a|n\.?\s*a\.?|na|none|null|unknown|unk|not[\s_-]*(?:reported|determined|available)|no[\s_-]*data|[.?-]+)(?:$|[\s([<])/i;
const yHaplogroupInitials = new Set("ABCDEFGHIJKLMNOPQRST".split(""));
const mtdnaHaplogroupInitials = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));

export function informativeHaplogroup(value: string | null | undefined) {
  const text = asText(value).trim().replace(/\s+/g, " ");
  if (!text || missingHaplogroupPattern.test(text)) return "";
  return text;
}

function haplogroupMissingReason(value: string | null | undefined, kind: HaplogroupKind, molecularSex?: string | null): HaplogroupMissingReason {
  const text = asText(value).trim().toLowerCase();
  if (kind === "y" && (text.includes("female") || normalizeSex(molecularSex ?? null) === "Female")) return "female";
  if (text.includes("sex unknown")) return "sex unknown";
  if (text.includes("<2x") || text.includes("low coverage") || text.includes("coverage")) return "<2x";
  if (text.includes("unknown") || text === "unk") return "unknown";
  return "not reported";
}

export function haplogroupDisplayValue(value: string | null | undefined, kind: HaplogroupKind, molecularSex?: string | null) {
  const informative = informativeHaplogroup(value);
  if (informative) return informative;
  return `n/a (${haplogroupMissingReason(value, kind, molecularSex)})`;
}

function haplogroupCategoryLabel(value: string | null | undefined, kind: HaplogroupKind, molecularSex?: string | null) {
  const text = informativeHaplogroup(value);
  const match = text.match(/[A-Za-z]/);
  if (!match) {
    const reason = haplogroupMissingReason(value, kind, molecularSex);
    if (kind === "y" && reason === "female") return "No Y-DNA (female)";
    return `${kind === "y" ? "Y-DNA" : "mtDNA"} n/a (${reason})`;
  }

  const initial = match[0].toUpperCase();
  const allowed = kind === "y" ? yHaplogroupInitials : mtdnaHaplogroupInitials;
  if (allowed.has(initial)) return initial;
  return `${kind === "y" ? "Y-DNA" : "mtDNA"} n/a (unknown)`;
}

function groupKey(row: { id: string | number; genetic_id: string | null; group_id: string | null }) {
  return row.group_id || `No group ID:${row.genetic_id ?? row.id}`;
}

function stableSortKey(row: { id: string | number; genetic_id: string | null; group_id: string | null }) {
  return `${row.group_id ?? ""}:${row.genetic_id ?? ""}:${row.id}`;
}

function distinctText(values: Array<string | null | undefined>) {
  const unique = Array.from(new Set(values.map((value) => asText(value).trim()).filter(Boolean))).sort();
  return unique.length ? unique.join(", ") : null;
}

const commonGroupSuffixes = new Set([
  "AG",
  "DG",
  "SG",
  "TW",
  "HO",
  "LC",
  "UDG",
  "WGS",
  "WGC",
  "1240K"
]);

function suffixTokensFromValue(value: string | null | undefined) {
  return asText(value)
    .split(/[.,;:/|\\\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z0-9]{1,12}$/.test(token));
}

function suffixTokensFromRows(rows: MapCacheSourceRow[]) {
  const tokens = new Set(commonGroupSuffixes);
  for (const row of rows) {
    for (const token of suffixTokensFromValue(row.suffixes)) tokens.add(token);
  }
  return tokens;
}

function normalizedPopulationGroupId(groupId: string | null, suffixTokens: Set<string>) {
  const text = asText(groupId).trim();
  if (!text) return "";
  const parts = text.split(".");
  while (parts.length > 1) {
    const last = parts[parts.length - 1]?.trim().toUpperCase();
    if (!last || !suffixTokens.has(last)) break;
    parts.pop();
  }
  return parts.join(".") || text;
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

function colorDistance(a: string, b: string) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
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
  if (field === "y_haplogroup_initial" || field === "mtdna_initial") {
    const specialColors: Record<string, { light: string; dark: string }> = {
      "No Y-DNA (female)": { light: "#6b7280", dark: "#9ca3af" },
      "Y-DNA n/a (sex unknown)": { light: "#4b5563", dark: "#6b7280" },
      "Y-DNA n/a (<2x)": { light: "#374151", dark: "#4b5563" },
      "Y-DNA n/a (unknown)": { light: "#111827", dark: "#000000" },
      "Y-DNA n/a (not reported)": { light: "#020617", dark: "#000000" },
      "mtDNA n/a (<2x)": { light: "#52525b", dark: "#71717a" },
      "mtDNA n/a (unknown)": { light: "#27272a", dark: "#3f3f46" },
      "mtDNA n/a (not reported)": { light: "#020617", dark: "#000000" }
    };
    const color = specialColors[label]?.[theme];
    if (color) return color;
  }
  const palette = theme === "dark" ? categoricalPaletteDark : categoricalPaletteLight;
  return palette[hashText(`${field}:${label}`) % palette.length];
}

export function fixedLabelForRow(row: Pick<MapCacheSourceRow, "molecular_sex" | "data_type" | "y_hap_terminal" | "y_hap_isogg" | "mtdna_haplogroup" | "date_mean_bp">, field: MapColorBy) {
  if (field === "single") return "Matched samples";
  if (field === "sex") return normalizeSex(row.molecular_sex);
  if (field === "data_type") return asText(row.data_type) || "Unknown";
  if (field === "group_cluster") return "Population cluster";
  if (field === "y_haplogroup_initial") return haplogroupCategoryLabel(row.y_hap_isogg, "y", row.molecular_sex);
  if (field === "mtdna_initial") return haplogroupCategoryLabel(row.mtdna_haplogroup, "mtdna", row.molecular_sex);
  return periodInfo(row.date_mean_bp).label;
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
  date_mean_bp: { min: 0, max: 54000, stops: [0, 3150, 3600, 4200, 4750, 5300, 6300, 8000, 12000, 54000] },
  smart_date_mean_bp: { min: 0, max: 45000, stops: [0, 5000, 10000, 20000, 45000] }
};

function gradientValue(row: Pick<MapCacheSourceRow, "snp_1240k" | "snp_2m" | "coverage_1150k" | "date_mean_bp">, field: MapGradientBy) {
  if (field === "smart_date_mean_bp") return asNumber(row.date_mean_bp);
  return asNumber(row[field]);
}

export function gradientColor(value: number | null, field: MapGradientBy, theme: MapColorTheme, domain: GradientDomain) {
  if (value === null) return UNKNOWN_COLOR;
  if (field === "date_mean_bp") return ageBpColor(value, theme, domain);
  if (field === "smart_date_mean_bp") return smartAgeColor(value, theme, domain);
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
  if (field === "coverage_1150k") {
    return theme === "dark"
      ? ["#475569", "#0ea5e9", "#22d3a6", "#facc15", "#ff1493"]
      : ["#64748b", "#2563eb", "#10b981", "#f59e0b", "#dc2626"];
  }
  return theme === "dark"
    ? ["#c084fc", "#0ea5e9", "#22d3a6", "#facc15", "#fb923c"]
    : ["#6d28d9", "#2563eb", "#0891b2", "#16a34a", "#f59e0b"];
}

const AGE_BP_BASE_STOPS = [0, 3150, 3600, 4200, 4750, 5300, 6300, 8000, 12000];

const ageBpColorStops: Record<MapColorTheme, Array<{ value: number; color: string }>> = {
  light: [
    { value: 0, color: "#65a30d" },
    { value: 3150, color: "#facc15" },
    { value: 3600, color: "#fb923c" },
    { value: 4200, color: "#ef4444" },
    { value: 4750, color: "#db2777" },
    { value: 5300, color: "#7c3aed" },
    { value: 6300, color: "#14b8a6" },
    { value: 8000, color: "#7dd3fc" },
    { value: 12000, color: "#2563eb" }
  ],
  dark: [
    { value: 0, color: "#84cc16" },
    { value: 3150, color: "#fde047" },
    { value: 3600, color: "#fb923c" },
    { value: 4200, color: "#ef4444" },
    { value: 4750, color: "#f472b6" },
    { value: 5300, color: "#a78bfa" },
    { value: 6300, color: "#2dd4bf" },
    { value: 8000, color: "#7dd3fc" },
    { value: 12000, color: "#3b82f6" }
  ]
};

function ageBpAnchors(theme: MapColorTheme, domain: GradientDomain) {
  const highValue = Math.max(domain.max, 12000);
  const highColor = theme === "dark" ? "#0b1f5e" : "#061a4f";
  return [...ageBpColorStops[theme], { value: highValue, color: highColor }]
    .filter((stop, index, stops) => stops.findIndex((candidate) => candidate.value === stop.value) === index)
    .sort((a, b) => a.value - b.value);
}

function colorFromAnchors(value: number, anchors: Array<{ value: number; color: string }>) {
  if (value <= anchors[0].value) return anchors[0].color;
  if (value >= anchors[anchors.length - 1].value) return anchors[anchors.length - 1].color;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (value < start.value || value > end.value) continue;
    const local = (value - start.value) / Math.max(0.000001, end.value - start.value);
    return interpolateColor([start.color, end.color], local);
  }

  return anchors[anchors.length - 1].color;
}

function ageBpDomain(rows: MapCacheSourceRow[]): GradientDomain {
  const values = rows
    .map((row) => asNumber(row.date_mean_bp))
    .filter((value): value is number => value !== null && value >= 0 && value <= DATE_MEAN_BP_GRADIENT_MAX);
  if (!values.length) return gradientFallbackDomains.date_mean_bp;

  const max = Math.max(...values);
  const stops = uniqueStops(
    [...AGE_BP_BASE_STOPS.filter((value) => value <= max), max],
    gradientFallbackDomains.date_mean_bp
  );
  return { min: 0, max, stops };
}

function ageBpColor(value: number, theme: MapColorTheme, domain: GradientDomain) {
  if (value < 0 || value > DATE_MEAN_BP_GRADIENT_MAX) return UNKNOWN_COLOR;
  return colorFromAnchors(value, ageBpAnchors(theme, domain));
}

const smartAgeSegmentDefinitions: Array<{
  label: string;
  subLabel: string;
  marks: string[];
  min: number;
  max: number | "sample-max";
  startColorLight: string;
  endColorLight: string;
  startColorDark: string;
  endColorDark: string;
}> = [
  {
    label: "Paleolithic-Mesolithic",
    subLabel: "Paleolithic | Early Mesolithic | Late Mesolithic",
    marks: ["Paleolithic", "Early Mesolithic", "Late Mesolithic"],
    min: 8000,
    max: "sample-max",
    startColorLight: "#0f172a",
    endColorLight: "#2563eb",
    startColorDark: "#1e40af",
    endColorDark: "#0ea5e9"
  },
  {
    label: "Neolithic-Chalcolithic",
    subLabel: "EN | MN | LN | Chalcolithic",
    marks: ["EN", "MN", "LN", "Chalcolithic"],
    min: 5300,
    max: 8000,
    startColorLight: "#b45309",
    endColorLight: "#4a2c0a",
    startColorDark: "#d97706",
    endColorDark: "#78350f"
  },
  {
    label: "Bronze Age",
    subLabel: "EBA | MBA | MLBA | LBA",
    marks: ["EBA", "MBA", "MLBA", "LBA"],
    min: 3150,
    max: 5300,
    startColorLight: "#7c3aed",
    endColorLight: "#dc2626",
    startColorDark: "#8b5cf6",
    endColorDark: "#ef4444"
  },
  {
    label: "Iron Age-Modern",
    subLabel: "Iron Age | Classical | Medieval | Modern",
    marks: ["Iron Age", "Classical", "Medieval", "Modern"],
    min: 0,
    max: 3150,
    startColorLight: "#0f766e",
    endColorLight: "#65a30d",
    startColorDark: "#14b8a6",
    endColorDark: "#84cc16"
  }
];

function smartAgeDomain(rows: MapCacheSourceRow[]): GradientDomain {
  const dateRows = rows
    .map((row) => asNumber(row.date_mean_bp))
    .filter((value): value is number => value !== null && value >= 0 && value <= DATE_MEAN_BP_GRADIENT_MAX);
  if (!dateRows.length) return gradientFallbackDomains.smart_date_mean_bp;

  const dataMax = Math.max(...dateRows);
  const dataMin = Math.min(...dateRows);
  const segments: SmartAgeSegment[] = [];
  for (const definition of smartAgeSegmentDefinitions) {
    const rangeMax = definition.max === "sample-max" ? Math.max(definition.min, dataMax) : definition.max;
    const rangeMin = definition.min;
    if (rangeMax <= dataMin || rangeMin > dataMax) continue;
    const isYoungestSegment = rangeMin === 0;
    const values = dateRows.filter((value) => (isYoungestSegment ? value >= rangeMin : value > rangeMin) && value <= rangeMax);
    const count = values.length;
    if (!count) continue;
    segments.push({
      label: definition.label,
      subLabel: definition.subLabel,
      marks: definition.marks,
      min: Math.max(rangeMin, dataMin),
      max: Math.min(rangeMax, dataMax),
      startColorLight: definition.startColorLight,
      endColorLight: definition.endColorLight,
      startColorDark: definition.startColorDark,
      endColorDark: definition.endColorDark,
      count
    });
  }

  const ordered = segments.sort((a, b) => b.max - a.max);
  return {
    min: dataMin,
    max: dataMax,
    stops: Array.from(new Set(ordered.flatMap((segment) => [segment.min, segment.max]))).sort((a, b) => a - b),
    segments: ordered
  };
}

function smartAgeColor(value: number, theme: MapColorTheme, domain: GradientDomain) {
  if (value < 0 || value > DATE_MEAN_BP_GRADIENT_MAX) return UNKNOWN_COLOR;
  const segments = domain.segments ?? [];
  const segment = segments.find((candidate) => value >= candidate.min && value <= candidate.max)
    ?? segments.find((candidate) => value >= candidate.min && value < candidate.max);
  if (!segment) return UNKNOWN_COLOR;
  const start = theme === "dark" ? segment.startColorDark : segment.startColorLight;
  const end = theme === "dark" ? segment.endColorDark : segment.endColorLight;
  const local = (segment.max - value) / Math.max(1, segment.max - segment.min);
  return interpolateColor([start, end], local);
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
    if (field === "date_mean_bp") {
      domains[field] = ageBpDomain(rows);
      continue;
    }
    if (field === "smart_date_mean_bp") {
      domains[field] = smartAgeDomain(rows);
      continue;
    }
    const values = rows
      .map((row) => gradientValue(row, field))
      .filter((value): value is number => value !== null);
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
  if (field === "date_mean_bp" || field === "smart_date_mean_bp") return `${formatInteger(value)} BP`;
  return formatInteger(value);
}

function gradientTitle(field: MapGradientBy) {
  if (field === "snp_1240k") return "SNPs 1240k";
  if (field === "snp_2m") return "SNPs 2M";
  if (field === "coverage_1150k") return "Coverage 1.15M";
  if (field === "smart_date_mean_bp") return "Age BP (split)";
  return "Age BP";
}

function gradientStops(field: MapGradientBy, theme: MapColorTheme, domain: GradientDomain) {
  if (field === "smart_date_mean_bp" && domain.segments?.length) {
    return domain.segments.flatMap((segment) => ([
      {
        value: segment.max,
        label: formatGradientTick(segment.max, field),
        color: theme === "dark" ? segment.startColorDark : segment.startColorLight
      },
      {
        value: segment.min,
        label: formatGradientTick(segment.min, field),
        color: theme === "dark" ? segment.endColorDark : segment.endColorLight
      }
    ]));
  }
  const values = field === "date_mean_bp" ? [...domain.stops].sort((a, b) => b - a) : domain.stops;
  return values.map((value) => {
    return {
      value,
      label: formatGradientTick(value, field),
      color: gradientColor(value, field, theme, domain)
    };
  });
}

function gradientSegments(field: MapGradientBy, theme: MapColorTheme, domain: GradientDomain) {
  if (field !== "smart_date_mean_bp" || !domain.segments?.length) return null;
  return domain.segments.map((segment) => ({
    label: segment.label,
    subLabel: segment.subLabel,
    marks: segment.marks,
    min: segment.min,
    max: segment.max,
    startColor: theme === "dark" ? segment.startColorDark : segment.startColorLight,
    endColor: theme === "dark" ? segment.endColorDark : segment.endColorLight,
    count: segment.count
  }));
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

function populationClusterLabel(row: { group_id: string | null; genetic_id?: string | null; id?: string | number }, suffixTokens: Set<string>) {
  return normalizedPopulationGroupId(row.group_id, suffixTokens) || `No group ID:${row.genetic_id ?? row.id ?? "unknown"}`;
}

function fallbackGroupClusterStyle(label: string) {
  const index = hashText(label) % groupClusterPalette.length;
  const palette = groupClusterPalette[index];
  return {
    label,
    light: palette.light,
    dark: palette.dark,
    sort: hashText(label),
    index
  };
}

function groupClusterPaletteIndex(color: string, theme: MapColorTheme) {
  return groupClusterPalette.findIndex((palette) => palette[theme] === color);
}

function groupClusterLegendLabel(index: number) {
  return `Color ${index + 1}`;
}

function chooseGroupClusterPaletteIndex(label: string, nearbyStyles: Array<{ index: number; dark: string }>) {
  if (!nearbyStyles.length) return hashText(label) % groupClusterPalette.length;
  let bestIndex = 0;
  let bestScore = -Infinity;
  const hashPreference = hashText(label) % groupClusterPalette.length;

  for (let index = 0; index < groupClusterPalette.length; index += 1) {
    const palette = groupClusterPalette[index];
    const nearestDistance = Math.min(...nearbyStyles.map((style) => colorDistance(palette.dark, style.dark)));
    const directConflictPenalty = nearbyStyles.some((style) => style.index === index) ? 500 : 0;
    const hashTieBreaker = 1 / (1 + Math.abs(index - hashPreference));
    const score = nearestDistance - directConflictPenalty + hashTieBreaker;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function assignGroupClusterStyles(sites: SiteCluster[]) {
  type ClusterEntry = {
    label: string;
    sampleCount: number;
    weightedLatitude: number;
    weightedLongitude: number;
    latitude: number;
    longitude: number;
  };

  const entries = new Map<string, ClusterEntry>();
  for (const site of sites) {
    const label = site.rows[0]?.group_cluster_label ?? (asText(site.groupId) || "No group ID");
    const weight = Math.max(1, site.rows.length);
    const current = entries.get(label);
    if (current) {
      current.sampleCount += weight;
      current.weightedLatitude += site.latitude * weight;
      current.weightedLongitude += site.longitude * weight;
      current.latitude = current.weightedLatitude / current.sampleCount;
      current.longitude = current.weightedLongitude / current.sampleCount;
    } else {
      entries.set(label, {
        label,
        sampleCount: weight,
        weightedLatitude: site.latitude * weight,
        weightedLongitude: site.longitude * weight,
        latitude: site.latitude,
        longitude: site.longitude
      });
    }
  }

  const clusters = Array.from(entries.values());
  const neighbors = new Map<string, Set<string>>();
  for (const cluster of clusters) neighbors.set(cluster.label, new Set());
  for (let firstIndex = 0; firstIndex < clusters.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < clusters.length; secondIndex += 1) {
      const first = clusters[firstIndex];
      const second = clusters[secondIndex];
      if (haversineKm(first, second) > GROUP_CLUSTER_COLOR_RADIUS_KM) continue;
      neighbors.get(first.label)?.add(second.label);
      neighbors.get(second.label)?.add(first.label);
    }
  }

  const assigned = new Map<string, { label: string; light: string; dark: string; sort: number; index: number }>();
  const sorted = [...clusters].sort((a, b) => {
    const degree = (neighbors.get(b.label)?.size ?? 0) - (neighbors.get(a.label)?.size ?? 0);
    if (degree) return degree;
    return b.sampleCount - a.sampleCount || a.label.localeCompare(b.label);
  });

  for (const cluster of sorted) {
    const nearbyStyles = Array.from(neighbors.get(cluster.label) ?? [])
      .map((label) => assigned.get(label))
      .filter((style): style is { label: string; light: string; dark: string; sort: number; index: number } => Boolean(style));
    const paletteIndex = chooseGroupClusterPaletteIndex(cluster.label, nearbyStyles);
    const palette = groupClusterPalette[paletteIndex];
    assigned.set(cluster.label, {
      label: cluster.label,
      light: palette.light,
      dark: palette.dark,
      sort: hashText(cluster.label),
      index: paletteIndex
    });
  }

  return assigned;
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
  const smartDateBp = gradientValue(row, "smart_date_mean_bp");

  return {
    sample_id: row.sample_id,
    release_id: row.release_id_text,
    row_number: row.row_number,
    genetic_id: row.genetic_id,
    group_id: row.group_id,
    group_site_key: row.group_site_key,
    locality: row.locality,
    political_entity: row.political_entity,
    regions: row.regions,
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
    group_cluster_label: row.group_cluster_label,
    group_cluster_color_light: row.group_cluster_color_light,
    group_cluster_color_dark: row.group_cluster_color_dark,
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
    gradient_date_mean_bp_color_dark: gradientColor(dateBp, "date_mean_bp", "dark", domains.date_mean_bp),
    gradient_smart_date_mean_bp_value: smartDateBp,
    gradient_smart_date_mean_bp_color_light: gradientColor(smartDateBp, "smart_date_mean_bp", "light", domains.smart_date_mean_bp),
    gradient_smart_date_mean_bp_color_dark: gradientColor(smartDateBp, "smart_date_mean_bp", "dark", domains.smart_date_mean_bp)
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
  const smartDateBp = aggregateNumeric(sourceRows, (row) => gradientValue(row, "smart_date_mean_bp"));

  return {
    group_site_key: site.groupSiteKey,
    release_id: releaseId,
    group_id: site.groupId,
    regions: distinctText(sourceRows.map((row) => row.regions)),
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
    group_cluster_label: site.rows[0]?.group_cluster_label ?? "No group ID",
    group_cluster_color_light: site.rows[0]?.group_cluster_color_light ?? UNKNOWN_COLOR,
    group_cluster_color_dark: site.rows[0]?.group_cluster_color_dark ?? UNKNOWN_COLOR,
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
    gradient_date_mean_bp_color_dark: gradientColor(dateBp, "date_mean_bp", "dark", domains.date_mean_bp),
    gradient_smart_date_mean_bp_value: smartDateBp,
    gradient_smart_date_mean_bp_color_light: gradientColor(smartDateBp, "smart_date_mean_bp", "light", domains.smart_date_mean_bp),
    gradient_smart_date_mean_bp_color_dark: gradientColor(smartDateBp, "smart_date_mean_bp", "dark", domains.smart_date_mean_bp)
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
        const color = String(sample[colorColumn] ?? UNKNOWN_COLOR);
        const paletteIndex = field === "group_cluster" ? groupClusterPaletteIndex(color, theme) : -1;
        const label = field === "group_cluster" && paletteIndex >= 0
          ? groupClusterLegendLabel(paletteIndex)
          : String(sample[labelColumn] ?? "Unknown");
        const key = field === "group_cluster" ? color : label;
        const current = counts.get(key);
        if (current) {
          current.count += 1;
        } else {
          counts.set(key, {
            color,
            count: 1,
            sort: field === "period"
              ? sample.period_sort
              : field === "group_cluster" && paletteIndex >= 0
                ? paletteIndex
                : label === "Unknown"
                  ? 999999
                  : hashText(label)
          });
        }
      }

      Array.from(counts.entries())
        .map(([labelOrColor, item]) => {
          const paletteIndex = field === "group_cluster" ? groupClusterPaletteIndex(item.color, theme) : -1;
          return {
            label: field === "group_cluster" && paletteIndex >= 0 ? groupClusterLegendLabel(paletteIndex) : labelOrColor,
            item
          };
        })
        .sort((a, b) => a.item.sort - b.item.sort || a.label.localeCompare(b.label))
        .forEach(({ label, item }, index) => {
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
            segments: null,
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
      const segments = gradientSegments(field, theme, domain);
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
        segments: segments ? JSON.stringify(segments) : null,
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
  const suffixTokens = suffixTokensFromRows(rows);
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
        outlier_target_longitude: null,
        group_cluster_label: populationClusterLabel(row, suffixTokens),
        group_cluster_color_light: UNKNOWN_COLOR,
        group_cluster_color_dark: UNKNOWN_COLOR,
        group_cluster_sort: 999999
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
  const groupClusterStyles = assignGroupClusterStyles(sites);
  for (const row of workingRows) {
    const label = row.group_cluster_label;
    const style = groupClusterStyles.get(label) ?? fallbackGroupClusterStyle(label);
    row.group_cluster_label = style.label;
    row.group_cluster_color_light = style.light;
    row.group_cluster_color_dark = style.dark;
    row.group_cluster_sort = style.sort;
  }

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
  "regions",
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
  "group_cluster_label",
  "group_cluster_color_light",
  "group_cluster_color_dark",
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
  "gradient_date_mean_bp_color_dark",
  "gradient_smart_date_mean_bp_value",
  "gradient_smart_date_mean_bp_color_light",
  "gradient_smart_date_mean_bp_color_dark"
];

const groupCacheColumns: Array<keyof GroupMapCacheRecord> = [
  "group_site_key",
  "release_id",
  "group_id",
  "regions",
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
  "group_cluster_label",
  "group_cluster_color_light",
  "group_cluster_color_dark",
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
  "gradient_date_mean_bp_color_dark",
  "gradient_smart_date_mean_bp_value",
  "gradient_smart_date_mean_bp_color_light",
  "gradient_smart_date_mean_bp_color_dark"
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
  "segments",
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
          regions,
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
          suffixes,
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
