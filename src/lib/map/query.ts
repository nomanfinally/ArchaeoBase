import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { getLatestReleaseId, getPool } from "@/lib/db";
import { compileGlobalSearch, compileSampleFilter, mergeWhere } from "@/lib/filters/compile";
import type { MapBounds, SqlFragment } from "@/lib/filters/types";
import { assessCoordinate } from "./coordinate-sanity";
import type {
  MapColorBy,
  MapCoordinateIssue,
  MapLineProperties,
  MapPointProperties,
  MapPresentation,
  MapQueryRequest,
  MapQueryResponse,
  MapUnmappedSample,
  MapViewport
} from "./types";

export const MAP_RENDER_CONSTANTS = {
  groupSpacingPx: 24,
  sampleSpacingPx: 8,
  smartAggregateCellPx: 56,
  maxSmartDisplacementPx: 32,
  groupDisplacementCapPx: 80,
  sameSiteRadiusKm: 25,
  groupOutlierLinkKm: 75
};

export type SampleMapRow = {
  id: string;
  genetic_id: string | null;
  group_id: string | null;
  locality: string | null;
  political_entity: string | null;
  date_mean_year_ce: number | null;
  snp_1240k: number | null;
  molecular_sex: string | null;
  y_hap_isogg: string | null;
  y_hap_terminal: string | null;
  mtdna_haplogroup: string | null;
  data_type: string | null;
  assessment: string | null;
  latitude: number | null;
  longitude: number | null;
};

type GroupSite = {
  groupId: string;
  rows: SampleMapRow[];
  latitude: number;
  longitude: number;
  isOutlier: boolean;
  primaryLatitude: number;
  primaryLongitude: number;
};

const MAX_VISIBLE_ROWS = 60000;
const UNMAPPED_PREVIEW_LIMIT = 50;

const categoryPalette = ["#c49a2c", "#bb4f8f", "#6b7899", "#2f6f4f", "#386cb0", "#a55f22", "#6d5798", "#24706b", "#9d3f4f", "#667085"];

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

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function stableSortKey(row: SampleMapRow) {
  return `${row.group_id ?? ""}:${row.genetic_id ?? ""}:${row.id}`;
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

function normalizeSex(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return "Unknown";
  if (text === "m" || text.includes("male")) return "Male";
  if (text === "f" || text.includes("female")) return "Female";
  if (text.includes("m") && !text.includes("f")) return "Male";
  if (text.includes("f") && !text.includes("m")) return "Female";
  return "Unknown";
}

function periodForYear(year: number | null) {
  if (year === null) return "Unknown";
  if (year < -10000) return "Paleolithic";
  if (year < -3000) return "Neolithic";
  if (year < -1200) return "Bronze Age";
  if (year < -500) return "Iron Age";
  if (year < 500) return "Classical";
  if (year < 1500) return "Medieval";
  return "Modern";
}

function colorForPeriod(label: string) {
  const colors: Record<string, string> = {
    Paleolithic: "#6b7280",
    Neolithic: "#2f6f4f",
    "Bronze Age": "#a55f22",
    "Iron Age": "#6d5798",
    Classical: "#386cb0",
    Medieval: "#9d3f4f",
    Modern: "#24706b",
    Unknown: "#6b7899"
  };
  return colors[label] ?? colors.Unknown;
}

function colorForLabel(label: string) {
  if (label === "Male") return "#386cb0";
  if (label === "Female") return "#bb4f8f";
  if (label === "Unknown") return "#6b7899";
  return categoryPalette[hashText(label) % categoryPalette.length];
}

function colorInfoForRows(rows: SampleMapRow[], colorBy: MapColorBy, kind: "sample" | "group" | "aggregate") {
  if (kind === "aggregate") {
    return { label: "Combined groups", color: "#516a8a" };
  }

  const first = rows[0];
  if (!first) return { label: "Matched rows", color: "#2f6f4f" };
  if (kind === "group" && rows.length > 1 && ["sex", "period", "country", "data_type", "assessment"].includes(colorBy)) {
    return { label: "Grouped samples", color: "#4b5563" };
  }

  if (colorBy === "sex") {
    const label = normalizeSex(asText(first.molecular_sex));
    return { label, color: colorForLabel(label) };
  }
  if (colorBy === "period") {
    const label = periodForYear(asNumber(first.date_mean_year_ce));
    return { label, color: colorForPeriod(label) };
  }
  if (colorBy === "country") {
    const label = asText(first.political_entity) || "Unknown";
    return { label, color: colorForLabel(label) };
  }
  if (colorBy === "data_type") {
    const label = asText(first.data_type) || "Unknown";
    return { label, color: colorForLabel(label) };
  }
  if (colorBy === "assessment") {
    const label = asText(first.assessment) || "Unknown";
    return { label, color: colorForLabel(label) };
  }
  if (colorBy === "sample_count") {
    const count = rows.length;
    const label = count >= 50 ? "50+ samples" : count >= 10 ? "10-49 samples" : count >= 2 ? "2-9 samples" : "1 sample";
    return { label, color: colorForLabel(label) };
  }
  if (colorBy === "multi_site") {
    return { label: "Single site", color: "#2f6f4f" };
  }
  return { label: "Matched rows", color: "#2f6f4f" };
}

function sampleDetail(row: SampleMapRow) {
  const geneticId = asText(row.genetic_id);
  const group = asText(row.group_id);
  const title = group || geneticId || "Sample";
  const place = [asText(row.locality), asText(row.political_entity)].filter(Boolean).join(", ");
  const yDna = asText(row.y_hap_terminal) || asText(row.y_hap_isogg);
  return {
    title,
    subtitle: place,
    popupRows: rowsJson([
      ["Sample", geneticId],
      ["Date", formatYear(asNumber(row.date_mean_year_ce))],
      ["Sex", normalizeSex(asText(row.molecular_sex))],
      ["Y-DNA", yDna],
      ["mtDNA", asText(row.mtdna_haplogroup)],
      ["SNPs", row.snp_1240k],
      ["Data", asText(row.data_type)]
    ])
  };
}

function groupDetail(groupId: string, rows: SampleMapRow[]) {
  const localities = Array.from(new Set(rows.map((row) => asText(row.locality)).filter(Boolean))).sort();
  const countries = Array.from(new Set(rows.map((row) => asText(row.political_entity)).filter(Boolean))).sort();
  const years = rows.map((row) => asNumber(row.date_mean_year_ce)).filter((value): value is number => value !== null);
  const snps = rows.map((row) => asNumber(row.snp_1240k)).filter((value): value is number => value !== null);
  const avgSnps = snps.length ? Math.round(snps.reduce((total, value) => total + value, 0) / snps.length) : null;
  const dateText = years.length ? `${formatYear(Math.min(...years))} to ${formatYear(Math.max(...years))}` : "";
  return {
    title: groupId || "Group",
    subtitle: countries.join(", ") || truncateText(localities.join("; ")),
    popupRows: rowsJson([
      ["Samples", rows.length],
      ["Date span", dateText],
      ["Countries", truncateText(countries.join(", "))],
      ["Localities", truncateText(localities.join("; "))],
      ["Avg SNPs", avgSnps]
    ])
  };
}

function aggregateDetail(groupCount: number, sampleCount: number, rows: SampleMapRow[]) {
  const countries = Array.from(new Set(rows.map((row) => asText(row.political_entity)).filter(Boolean))).sort();
  return {
    title: "Combined location",
    subtitle: `${formatInteger(groupCount)} groups, ${formatInteger(sampleCount)} samples`,
    popupRows: rowsJson([
      ["Groups", groupCount],
      ["Samples", sampleCount],
      ["Countries", truncateText(countries.join(", "))]
    ])
  };
}

function pointFeature(
  markerId: string,
  kind: MapPointProperties["kind"],
  latitude: number,
  longitude: number,
  properties: Omit<MapPointProperties, "markerId" | "kind" | "originalLatitude" | "originalLongitude">
): Feature<Point, MapPointProperties> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      markerId,
      kind,
      originalLatitude: latitude,
      originalLongitude: longitude,
      ...properties
    }
  };
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

function averageCoordinate(rows: SampleMapRow[]) {
  const points = rows.filter((row) => row.latitude !== null && row.longitude !== null) as Array<SampleMapRow & { latitude: number; longitude: number }>;
  return {
    latitude: points.reduce((total, row) => total + row.latitude, 0) / points.length,
    longitude: points.reduce((total, row) => total + row.longitude, 0) / points.length
  };
}

function clusterGroupSites(groupId: string, rows: SampleMapRow[]): GroupSite[] {
  const sortedRows = [...rows].sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));
  const clusters: Array<{ rows: SampleMapRow[]; latitude: number; longitude: number }> = [];

  for (const row of sortedRows) {
    if (row.latitude === null || row.longitude === null) continue;
    const matching = clusters.find((cluster) =>
      haversineKm({ latitude: row.latitude ?? 0, longitude: row.longitude ?? 0 }, cluster) <= MAP_RENDER_CONSTANTS.sameSiteRadiusKm
    );
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
  return clusters.map((cluster) => {
    const distanceToPrimary = primary ? haversineKm(cluster, primary) : 0;
    return {
      groupId,
      rows: cluster.rows,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      isOutlier: Boolean(primary && cluster !== primary && distanceToPrimary >= MAP_RENDER_CONSTANTS.groupOutlierLinkKm),
      primaryLatitude: primary?.latitude ?? cluster.latitude,
      primaryLongitude: primary?.longitude ?? cluster.longitude
    };
  });
}

function groupRowsById(rows: SampleMapRow[]) {
  const groups = new Map<string, SampleMapRow[]>();
  for (const row of rows) {
    const key = row.group_id || `No group ID:${row.genetic_id ?? row.id}`;
    const current = groups.get(key);
    if (current) current.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export function buildSampleFeatures(rows: SampleMapRow[], colorBy: MapColorBy) {
  const features: Array<Feature<Point, MapPointProperties>> = [];
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) continue;
    const colorInfo = colorInfoForRows([row], colorBy, "sample");
    const detail = sampleDetail(row);
    features.push(
      pointFeature(`sample:${row.id}`, "sample", row.latitude, row.longitude, {
        label: "",
        sampleCount: 1,
        groupCount: row.group_id ? 1 : 0,
        groupId: row.group_id ?? "",
        markerColor: colorInfo.color,
        colorLabel: colorInfo.label,
        ...detail
      })
    );
  }
  return { features, leaderLines: [] as Array<Feature<LineString, MapLineProperties>> };
}

export function buildGroupFeatures(rows: SampleMapRow[], colorBy: MapColorBy) {
  const features: Array<Feature<Point, MapPointProperties>> = [];
  const leaderLines: Array<Feature<LineString, MapLineProperties>> = [];

  for (const [groupId, groupRows] of groupRowsById(rows)) {
    const sites = clusterGroupSites(groupId, groupRows);
    sites.forEach((site, siteIndex) => {
      const colorInfo = colorInfoForRows(site.rows, colorBy, "group");
      const detail = groupDetail(groupId, site.rows);
      const markerId = `group:${groupId}:${siteIndex}`;
      features.push(
        pointFeature(markerId, "group", site.latitude, site.longitude, {
          label: String(site.rows.length),
          sampleCount: site.rows.length,
          groupCount: 1,
          groupId,
          markerColor: colorInfo.color,
          colorLabel: colorInfo.label,
          ...detail
        })
      );

      if (site.isOutlier) {
        leaderLines.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [site.primaryLongitude, site.primaryLatitude],
              [site.longitude, site.latitude]
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
    });
  }

  return { features, leaderLines };
}

function mercatorY(latitude: number) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function project(bounds: MapBounds, viewport: MapViewport, longitude: number, latitude: number) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const west = bounds.west;
  const east = bounds.east <= bounds.west ? bounds.east + 360 : bounds.east;
  const adjustedLongitude = longitude < west ? longitude + 360 : longitude;
  const northY = mercatorY(bounds.north);
  const southY = mercatorY(bounds.south);
  const ySpan = Math.max(0.000001, northY - southY);
  return {
    x: ((adjustedLongitude - west) / Math.max(0.000001, east - west)) * width,
    y: ((northY - mercatorY(latitude)) / ySpan) * height
  };
}

function unproject(bounds: MapBounds, viewport: MapViewport, x: number, y: number) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const west = bounds.west;
  const east = bounds.east <= bounds.west ? bounds.east + 360 : bounds.east;
  const longitudeRaw = west + (x / width) * (east - west);
  const longitude = longitudeRaw > 180 ? longitudeRaw - 360 : longitudeRaw;
  const northY = mercatorY(bounds.north);
  const southY = mercatorY(bounds.south);
  const mercY = northY - (y / height) * (northY - southY);
  const latitude = (Math.atan(Math.sinh(mercY)) * 180) / Math.PI;
  return { latitude, longitude };
}

function buildAggregateFeatures(rows: SampleMapRow[], colorBy: MapColorBy, bounds: MapBounds, viewport: MapViewport) {
  const cells = new Map<string, SampleMapRow[]>();

  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) continue;
    const screen = project(bounds, viewport, row.longitude, row.latitude);
    const cellX = Math.floor(screen.x / MAP_RENDER_CONSTANTS.smartAggregateCellPx);
    const cellY = Math.floor(screen.y / MAP_RENDER_CONSTANTS.smartAggregateCellPx);
    const key = `${cellX}:${cellY}`;
    const current = cells.get(key);
    if (current) current.push(row);
    else cells.set(key, [row]);
  }

  const features: Array<Feature<Point, MapPointProperties>> = [];
  Array.from(cells.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, cellRows]) => {
      const groups = new Set(cellRows.map((row) => row.group_id || `sample:${row.id}`));
      const center = averageCoordinate(cellRows);
      const colorInfo = colorInfoForRows(cellRows, colorBy, "aggregate");
      const detail = aggregateDetail(groups.size, cellRows.length, cellRows);
      features.push(
        pointFeature(`aggregate:${key}`, "aggregate", center.latitude, center.longitude, {
          label: `${groups.size} | ${cellRows.length}`,
          sampleCount: cellRows.length,
          groupCount: groups.size,
          groupId: "",
          markerColor: colorInfo.color,
          colorLabel: colorInfo.label,
          ...detail
        })
      );
    });

  return { features, leaderLines: [] as Array<Feature<LineString, MapLineProperties>> };
}

export function buildSmartFeatures(
  rows: SampleMapRow[],
  colorBy: MapColorBy,
  bounds: MapBounds,
  viewport: MapViewport,
  zoom: number,
  combineNearbyGroups: boolean
) {
  if (zoom >= 7) return buildSampleFeatures(rows, colorBy);
  if (zoom >= 4 || !combineNearbyGroups) return buildGroupFeatures(rows, colorBy);
  return buildAggregateFeatures(rows, colorBy, bounds, viewport);
}

type LayoutCluster = {
  features: Array<Feature<Point, MapPointProperties>>;
  x: number;
  y: number;
};

function layoutSettings(kind: MapPointProperties["kind"]) {
  if (kind === "sample") {
    return {
      spacing: MAP_RENDER_CONSTANTS.sampleSpacingPx,
      cap: MAP_RENDER_CONSTANTS.maxSmartDisplacementPx,
      drawLeader: false
    };
  }
  if (kind === "aggregate") {
    return {
      spacing: MAP_RENDER_CONSTANTS.smartAggregateCellPx,
      cap: MAP_RENDER_CONSTANTS.maxSmartDisplacementPx,
      drawLeader: false
    };
  }
  return {
    spacing: MAP_RENDER_CONSTANTS.groupSpacingPx,
    cap: MAP_RENDER_CONSTANTS.groupDisplacementCapPx,
    drawLeader: true
  };
}

function clusterFeatures(features: Array<Feature<Point, MapPointProperties>>, bounds: MapBounds, viewport: MapViewport, spacing: number) {
  const grid = new Map<string, LayoutCluster[]>();
  const clusters: LayoutCluster[] = [];
  const cellSize = Math.max(1, spacing);

  for (const feature of features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const screen = project(bounds, viewport, longitude, latitude);
    const cellX = Math.floor(screen.x / cellSize);
    const cellY = Math.floor(screen.y / cellSize);
    let target: LayoutCluster | null = null;

    for (let dx = -1; dx <= 1 && !target; dx += 1) {
      for (let dy = -1; dy <= 1 && !target; dy += 1) {
        const candidates = grid.get(`${cellX + dx}:${cellY + dy}`) ?? [];
        target = candidates.find((cluster) => Math.hypot(cluster.x - screen.x, cluster.y - screen.y) < spacing) ?? null;
      }
    }

    if (target) {
      target.features.push(feature);
      target.x = (target.x * (target.features.length - 1) + screen.x) / target.features.length;
      target.y = (target.y * (target.features.length - 1) + screen.y) / target.features.length;
    } else {
      target = { features: [feature], x: screen.x, y: screen.y };
      clusters.push(target);
      const key = `${cellX}:${cellY}`;
      const existing = grid.get(key);
      if (existing) existing.push(target);
      else grid.set(key, [target]);
    }
  }

  return clusters;
}

function offsetFor(index: number, total: number, spacing: number, cap: number, seed: number, kind: MapPointProperties["kind"]) {
  if (total <= 1) return { dx: 0, dy: 0 };
  const dynamicCap = kind === "sample" ? Math.max(cap, Math.min(180, Math.sqrt(total) * spacing * 1.55)) : cap;
  if (index === 0 && total < 4) return { dx: 0, dy: 0 };
  const ring = Math.floor(Math.sqrt(index));
  const radius = Math.min(dynamicCap, Math.max(spacing, ring * spacing * 0.9));
  const angle = ((index * 137.508 + seed) * Math.PI) / 180;
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius
  };
}

export function applyMapLayout(
  features: Array<Feature<Point, MapPointProperties>>,
  leaderLines: Array<Feature<LineString, MapLineProperties>>,
  bounds: MapBounds,
  viewport: MapViewport
) {
  const byKind = new Map<MapPointProperties["kind"], Array<Feature<Point, MapPointProperties>>>();
  features.forEach((feature) => {
    const current = byKind.get(feature.properties.kind);
    if (current) current.push(feature);
    else byKind.set(feature.properties.kind, [feature]);
  });

  const nextFeatures: Array<Feature<Point, MapPointProperties>> = [];
  const nextLeaderLines = [...leaderLines];

  for (const [kind, kindFeatures] of byKind) {
    const settings = layoutSettings(kind);
    const clusters = clusterFeatures(kindFeatures, bounds, viewport, settings.spacing);
    for (const cluster of clusters) {
      const sortedFeatures = [...cluster.features].sort((a, b) => a.properties.markerId.localeCompare(b.properties.markerId));
      sortedFeatures.forEach((feature, index) => {
        const seed = hashText(feature.properties.markerId) % 360;
        const offset = offsetFor(index, sortedFeatures.length, settings.spacing, settings.cap, seed, kind);
        const screen = project(bounds, viewport, feature.properties.originalLongitude, feature.properties.originalLatitude);
        const nextCoordinate = unproject(bounds, viewport, screen.x + offset.dx, screen.y + offset.dy);
        const nextFeature = {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: [nextCoordinate.longitude, nextCoordinate.latitude] as [number, number]
          }
        };
        nextFeatures.push(nextFeature);

        if (settings.drawLeader && Math.hypot(offset.dx, offset.dy) > 1.5) {
          nextLeaderLines.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [feature.properties.originalLongitude, feature.properties.originalLatitude],
                [nextCoordinate.longitude, nextCoordinate.latitude]
              ]
            },
            properties: {
              lineId: `displacement:${feature.properties.markerId}`,
              kind: "displacement",
              lineStyle: "solid",
              markerId: feature.properties.markerId,
              strokeColor: feature.properties.markerColor
            }
          });
        }
      });
    }
  }

  return {
    features: nextFeatures,
    leaderLines: nextLeaderLines
  };
}

function normalizeBounds(bounds?: MapBounds | null): MapBounds {
  if (!bounds) return { west: -180, south: -85, east: 180, north: 85 };
  return {
    west: Math.max(-180, Math.min(180, bounds.west)),
    south: Math.max(-85, Math.min(85, bounds.south)),
    east: Math.max(-180, Math.min(180, bounds.east)),
    north: Math.max(-85, Math.min(85, bounds.north))
  };
}

function normalizeViewport(viewport?: MapViewport | null): MapViewport {
  return {
    width: Math.max(320, Math.min(4096, Math.round(viewport?.width ?? 1280))),
    height: Math.max(240, Math.min(4096, Math.round(viewport?.height ?? 720)))
  };
}

function normalizeZoom(value: unknown) {
  const parsed = Number(value ?? 1.5);
  if (!Number.isFinite(parsed)) return 1.5;
  return Math.max(0, Math.min(18, parsed));
}

function mapBoundsFragment(bounds: MapBounds | null | undefined): SqlFragment {
  if (!bounds) return { text: "TRUE", params: [] };
  return {
    text: "mp.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)",
    params: [bounds.west, bounds.south, bounds.east, bounds.north]
  };
}

export function buildMapSampleWhere(request: MapQueryRequest, releaseId: string, options: { requireCoordinates?: boolean; bounds?: MapBounds | null; missingCoordinates?: boolean } = {}) {
  const filter = compileSampleFilter(request.filter);
  const globalSearch = compileGlobalSearch(request.globalSearch, request.searchField);
  const releaseFilter: SqlFragment = { text: "s.release_id = $1", params: [releaseId] };
  const coordinateFilter: SqlFragment = options.requireCoordinates
    ? { text: "mp.has_coordinates IS TRUE AND mp.latitude IS NOT NULL AND mp.longitude IS NOT NULL AND mp.geom IS NOT NULL", params: [] }
    : options.missingCoordinates
      ? { text: "(s.has_coordinates IS NOT TRUE OR s.latitude IS NULL OR s.longitude IS NULL)", params: [] }
      : { text: "TRUE", params: [] };
  return mergeWhere([releaseFilter, filter, globalSearch, coordinateFilter, mapBoundsFragment(options.bounds)]);
}

function issuePreview(row: SampleMapRow, assessment: ReturnType<typeof assessCoordinate>): MapCoordinateIssue {
  return {
    geneticId: asText(row.genetic_id),
    groupId: asText(row.group_id),
    locality: asText(row.locality),
    politicalEntity: asText(row.political_entity),
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    reason: assessment.reason,
    suggestedLatitude: assessment.suggestedLatitude,
    suggestedLongitude: assessment.suggestedLongitude
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

export async function runMapQuery(request: MapQueryRequest): Promise<MapQueryResponse> {
  const pool = getPool();
  const release = await getLatestReleaseId();
  const presentation: MapPresentation = request.presentation ?? "smart_split";
  const colorBy = request.colorBy ?? "default";
  const bounds = normalizeBounds(request.bounds);
  const viewport = normalizeViewport(request.viewport);
  const zoom = normalizeZoom(request.zoom);
  const combineNearbyGroups = request.combineNearbyGroups !== false;

  const allWhere = buildMapSampleWhere(request, release.id);
  const missingWhere = buildMapSampleWhere(request, release.id, { missingCoordinates: true });
  const mappedWhere = buildMapSampleWhere(request, release.id, { requireCoordinates: true, bounds });

  const counts = await pool.query(
    `
      SELECT
        count(*)::integer AS total_matched,
        count(*) FILTER (WHERE s.has_coordinates IS TRUE AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL)::integer AS mapped_samples,
        count(*) FILTER (WHERE s.has_coordinates IS NOT TRUE OR s.latitude IS NULL OR s.longitude IS NULL)::integer AS unmapped_samples
      FROM samples s
      WHERE ${allWhere.text}
    `,
    allWhere.params
  );

  const missingRows = await pool.query(
    `
      SELECT s.genetic_id, s.group_id, s.locality, s.political_entity
      FROM samples s
      WHERE ${missingWhere.text}
      ORDER BY s.genetic_id ASC
      LIMIT $${missingWhere.params.length + 1}
    `,
    [...missingWhere.params, UNMAPPED_PREVIEW_LIMIT]
  );

  const mappedRows = await pool.query<SampleMapRow>(
    `
      SELECT
        s.id::text,
        mp.genetic_id,
        mp.group_id,
        mp.locality,
        mp.political_entity,
        mp.date_mean_year_ce,
        mp.snp_1240k,
        mp.molecular_sex,
        mp.y_hap_isogg,
        mp.y_hap_terminal,
        mp.mtdna_haplogroup,
        mp.data_type,
        mp.assessment,
        mp.latitude,
        mp.longitude
      FROM samples s
      JOIN sample_map_points mp ON mp.sample_id = s.id
      WHERE ${mappedWhere.text}
      ORDER BY s.id ASC
      LIMIT $${mappedWhere.params.length + 1}
    `,
    [...mappedWhere.params, MAX_VISIBLE_ROWS]
  );

  const safeRows: SampleMapRow[] = [];
  const coordinateIssues: MapCoordinateIssue[] = [];
  for (const row of mappedRows.rows) {
    const assessment = assessCoordinate(row);
    if (assessment.ok) {
      safeRows.push(row);
    } else {
      coordinateIssues.push(issuePreview(row, assessment));
    }
  }

  let renderData: {
    features: Array<Feature<Point, MapPointProperties>>;
    leaderLines: Array<Feature<LineString, MapLineProperties>>;
  };
  if (presentation === "sample_cloud") {
    renderData = buildSampleFeatures(safeRows, colorBy);
  } else if (presentation === "group_locations") {
    renderData = buildGroupFeatures(safeRows, colorBy);
  } else {
    renderData = buildSmartFeatures(safeRows, colorBy, bounds, viewport, zoom, combineNearbyGroups);
  }

  const laidOut = applyMapLayout(renderData.features, renderData.leaderLines, bounds, viewport);
  const countRow = counts.rows[0] ?? { total_matched: 0, mapped_samples: 0, unmapped_samples: 0 };

  return {
    release,
    features: collection(laidOut.features),
    leaderLines: collection(laidOut.leaderLines),
    summary: {
      totalMatched: countRow.total_matched ?? 0,
      mappedSamples: countRow.mapped_samples ?? 0,
      visibleSamples: safeRows.length,
      visibleFeatures: laidOut.features.length,
      unmappedSamples: countRow.unmapped_samples ?? 0,
      coordinateIssues: coordinateIssues.length,
      presentation
    },
    unmappedSamples: {
      total: countRow.unmapped_samples ?? 0,
      samples: missingRows.rows.map(unmappedPreview)
    },
    coordinateIssues: {
      total: coordinateIssues.length,
      samples: coordinateIssues.slice(0, UNMAPPED_PREVIEW_LIMIT)
    }
  };
}
