import type { FeatureCollection, LineString, Point } from "geojson";
import type { FilterNode, MapBounds } from "@/lib/filters/types";

export type MapPresentation = "smart_split" | "group_locations" | "sample_cloud";

export type MapColorBy =
  | "default"
  | "sex"
  | "period"
  | "country"
  | "data_type"
  | "assessment"
  | "sample_count"
  | "multi_site";

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
  colorBy?: MapColorBy;
};

export type MapPointKind = "aggregate" | "group" | "sample";

export type MapPointProperties = {
  markerId: string;
  kind: MapPointKind;
  label: string;
  sampleCount: number;
  groupCount: number;
  groupId: string;
  markerColor: string;
  colorLabel: string;
  originalLatitude: number;
  originalLongitude: number;
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
  unmappedSamples: number;
  coordinateIssues: number;
  presentation: MapPresentation;
};

export type MapQueryResponse = {
  release: { id: string; name: string; row_count: number };
  features: FeatureCollection<Point, MapPointProperties>;
  leaderLines: FeatureCollection<LineString, MapLineProperties>;
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
