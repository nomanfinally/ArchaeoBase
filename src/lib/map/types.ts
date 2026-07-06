import type { FeatureCollection, LineString, Point } from "geojson";
import type { FilterNode, MapBounds, SnpColorSpec, SnpFilter } from "@/lib/filters/types";

export type MapPresentation = "smart_split" | "group_locations" | "sample_cloud";

export type MapColorBy =
  | "single"
  | "sex"
  | "data_type"
  | "group_cluster"
  | "y_haplogroup_initial"
  | "mtdna_initial"
  | "period";

export type MapColorMode = "fixed" | "gradient" | "snp";

export type MapGradientBy = "snp_1240k" | "snp_2m" | "coverage_1150k" | "date_mean_bp" | "smart_date_mean_bp";

export type MapColorTheme = "light" | "dark";

export const mapSnpPalettes = [
  { id: "red", label: "Red", colors: { two: "#991b1b", one: "#ef4444", zero: "#fecaca" } },
  { id: "blue", label: "Blue", colors: { two: "#1d4ed8", one: "#60a5fa", zero: "#dbeafe" } },
  { id: "green", label: "Green", colors: { two: "#166534", one: "#4ade80", zero: "#dcfce7" } },
  { id: "violet", label: "Violet", colors: { two: "#6d28d9", one: "#a78bfa", zero: "#ede9fe" } },
  { id: "orange", label: "Orange", colors: { two: "#c2410c", one: "#fb923c", zero: "#ffedd5" } },
  { id: "slate", label: "Slate", colors: { two: "#334155", one: "#94a3b8", zero: "#e2e8f0" } }
] as const;

export type MapSnpPalette = (typeof mapSnpPalettes)[number]["id"];

export const DEFAULT_MAP_SNP_PALETTE: MapSnpPalette = "red";

export type MapViewport = {
  width: number;
  height: number;
};

export type MapQueryRequest = {
  filter?: FilterNode | null;
  globalSearch?: string;
  searchField?: string | null;
  bounds?: MapBounds | null;
  zoom?: number;
  viewport?: MapViewport | null;
  presentation?: MapPresentation;
  combineNearbyGroups?: boolean;
  colorMode?: MapColorMode;
  colorBy?: MapColorBy;
  gradientBy?: MapGradientBy;
  colorTheme?: MapColorTheme;
  showGroupCounts?: boolean;
  snpFilters?: SnpFilter[];
  snpColor?: SnpColorSpec | null;
  snpPalette?: MapSnpPalette;
  includeSnpZeroCopies?: boolean;
};

export type MapPointKind = "aggregate" | "group" | "sample" | "centroid";
export type MapMarkerShape = "circle" | "triangle";

export type MapLegendItem = {
  label: string;
  color: string;
  count: number;
};

export type MapGradientStop = {
  value: number;
  label: string;
  color: string;
};

export type MapGradientSegment = {
  label: string;
  subLabel?: string;
  marks?: string[];
  min: number;
  max: number;
  startColor: string;
  endColor: string;
  count: number;
};

export type MapLegend =
  | {
      kind: "categorical";
      title: string;
      items: MapLegendItem[];
      totalItems: number;
    }
  | {
      kind: "gradient";
      title: string;
      min: number | null;
      max: number | null;
      stops: MapGradientStop[];
      ticks: Array<{ value: number; label: string }>;
      segments?: MapGradientSegment[];
      unknownCount: number;
    };

export type MapPointProperties = {
  markerId: string;
  kind: MapPointKind;
  label: string;
  sampleCount: number;
  groupCount: number;
  groupId: string;
  markerColor: string;
  markerShape: MapMarkerShape;
  colorLabel: string;
  isUnknownColor: boolean;
  originalLatitude: number;
  originalLongitude: number;
  displayLatitude: number;
  displayLongitude: number;
  title: string;
  subtitle: string;
  popupRows: string;
};

export type MapLineProperties = {
  lineId: string;
  kind: "displacement" | "outlier";
  lineStyle: "solid" | "dashed";
  markerId: string;
  strokeColor: string;
};

export type MapUnmappedSample = {
  geneticId: string;
  groupId: string;
  locality: string;
  politicalEntity: string;
};

export type MapCoordinateIssue = MapUnmappedSample & {
  latitude: number;
  longitude: number;
  reason: string;
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
};

export type MapQuerySummary = {
  totalMatched: number;
  mappedSamples: number;
  visibleSamples: number;
  visibleFeatures: number;
  renderedSamples: number;
  renderedGroups: number;
  unmappedSamples: number;
  coordinateIssues: number;
  presentation: MapPresentation;
};

export type MapQueryResponse = {
  release: { id: string; name: string; row_count: number };
  features: FeatureCollection<Point, MapPointProperties>;
  leaderLines: FeatureCollection<LineString, MapLineProperties>;
  legend: MapLegend;
  summary: MapQuerySummary;
  unmappedSamples: {
    total: number;
    samples: MapUnmappedSample[];
  };
  coordinateIssues: {
    total: number;
    samples: MapCoordinateIssue[];
  };
};
