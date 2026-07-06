"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource, IControl, Map as MapLibreMap, MapMouseEvent, Popup, StyleSpecification } from "maplibre-gl";
import { Eye, EyeOff, Globe2, Map as MapIcon, Maximize2, Minimize2, Moon, Route, Satellite, Sun } from "lucide-react";
import type { FilterNode } from "@/lib/filters/types";
import type {
  MapColorBy,
  MapColorMode,
  MapGradientBy,
  MapLegend,
  MapLineProperties,
  MapPointProperties,
  MapPresentation,
  MapQueryResponse,
  MapQuerySummary
} from "@/lib/map/types";

export type MapBaseStyle = "dark" | "light" | "streets" | "satellite";
export type MapProjectionMode = "flat" | "globe";
export type { MapColorBy, MapColorMode, MapGradientBy, MapPresentation };

type Props = {
  filter: FilterNode;
  globalSearch: string;
  searchField: string | null;
  baseStyle: MapBaseStyle;
  onBaseStyleChange: (style: MapBaseStyle) => void;
  colorMode: MapColorMode;
  colorBy: MapColorBy;
  gradientBy: MapGradientBy;
  presentation: MapPresentation;
  combineNearbyGroups: boolean;
  showGroupCounts: boolean;
  showOutlierLinks: boolean;
  showCentroids: boolean;
  showLegend: boolean;
  fadeLegend: boolean;
  fullView: boolean;
  onFullViewChange: (fullView: boolean) => void;
  projectionMode: MapProjectionMode;
  onProjectionModeChange: (mode: MapProjectionMode) => void;
  onSummaryChange: (summary: MapQuerySummary, release: MapQueryResponse["release"]) => void;
  onReviewChange?: (review: Pick<MapQueryResponse, "unmappedSamples" | "coordinateIssues">) => void;
};

const POINT_SOURCE_ID = "archaebase-map-points";
const LINE_SOURCE_ID = "archaebase-map-lines";
const DISPLACEMENT_LINE_LAYER_ID = "archaebase-displacement-lines";
const OUTLIER_LINE_LAYER_ID = "archaebase-outlier-lines";
const POINT_LAYER_ID = "archaebase-map-point-circles";
const CENTROID_LAYER_ID = "archaebase-map-centroids";
const POINT_LABEL_LAYER_ID = "archaebase-map-point-labels";
const BOUNDARY_SOURCE_ID = "archaebase-boundaries";
const COUNTRY_BOUNDARY_LAYER_ID = "archaebase-country-boundaries";
const REGIONAL_BOUNDARY_LAYER_ID = "archaebase-regional-boundaries";
const COUNTRY_LABEL_LAYER_ID = "archaebase-country-labels";
const OPENFREEMAP_VECTOR_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const ESRI_BASE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services";

const emptyPointCollection: FeatureCollection<Point, MapPointProperties> = { type: "FeatureCollection", features: [] };
const emptyLineCollection: FeatureCollection<LineString, MapLineProperties> = { type: "FeatureCollection", features: [] };
const mapResponseCache = new Map<string, MapQueryResponse>();
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 22;

export const mapBaseStyles: { id: MapBaseStyle; label: string; swatch: string }[] = [
  { id: "dark", label: "Dark", swatch: "#111217" },
  { id: "light", label: "Light", swatch: "#f5f4ef" },
  { id: "streets", label: "Streets", swatch: "#f8f3c7" },
  { id: "satellite", label: "Satellite", swatch: "#3e4a59" }
];

const mapBaseStyleIcons: Record<MapBaseStyle, typeof Sun> = {
  light: Sun,
  dark: Moon,
  streets: Route,
  satellite: Satellite
};

export const mapFixedColorOptions: { id: MapColorBy; label: string }[] = [
  { id: "single", label: "Single color" },
  { id: "sex", label: "Molecular sex" },
  { id: "group_cluster", label: "Population cluster" },
  { id: "y_haplogroup_initial", label: "Y-DNA first letter" },
  { id: "mtdna_initial", label: "mtDNA first letter" },
  { id: "period", label: "Period" }
];

export const mapGradientOptions: { id: MapGradientBy; label: string }[] = [
  { id: "snp_1240k", label: "SNPs 1240k" },
  { id: "snp_2m", label: "SNPs 2M" },
  { id: "date_mean_bp", label: "Age BP" },
  { id: "smart_date_mean_bp", label: "Age BP (split)" }
];

function esriTileUrl(service: string) {
  return `${ESRI_BASE_URL}/${service}/MapServer/tile/{z}/{y}/{x}`;
}

function rasterSource(service: string, attribution = "Tiles © Esri") {
  return {
    type: "raster" as const,
    tiles: [esriTileUrl(service)],
    tileSize: 256,
    maxzoom: 19,
    attribution
  };
}

function projectionType(projectionMode: MapProjectionMode) {
  return projectionMode === "globe" ? "globe" : "mercator";
}

function mapStyleDefinition(baseStyle: MapBaseStyle, projectionMode: MapProjectionMode = "flat"): StyleSpecification {
  const styles: Record<MapBaseStyle, { sources: StyleSpecification["sources"]; layers: StyleSpecification["layers"] }> = {
    light: {
      sources: {
        basemap: rasterSource("World_Topo_Map")
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f4f4f1" } },
        { id: "basemap", type: "raster", source: "basemap" }
      ]
    },
    dark: {
      sources: {
        basemap: rasterSource("Canvas/World_Dark_Gray_Base"),
        reference: rasterSource("Canvas/World_Dark_Gray_Reference")
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#15171b" } },
        { id: "basemap", type: "raster", source: "basemap" },
        { id: "reference", type: "raster", source: "reference" }
      ]
    },
    streets: {
      sources: {
        basemap: rasterSource("World_Street_Map")
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f4f0e5" } },
        { id: "basemap", type: "raster", source: "basemap" }
      ]
    },
    satellite: {
      sources: {
        basemap: rasterSource("World_Imagery"),
        reference: rasterSource("Reference/World_Boundaries_and_Places")
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#1f252c" } },
        { id: "basemap", type: "raster", source: "basemap" },
        { id: "reference", type: "raster", source: "reference" }
      ]
    }
  };

  const selected = styles[baseStyle] ?? styles.light;
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    projection: { type: projectionType(projectionMode) },
    sources: selected.sources,
    layers: selected.layers
  };
}

function boundaryColors(baseStyle: MapBaseStyle) {
  if (baseStyle === "dark") return { country: "#ffffff", region: "#d1d5db", label: "#ffffff", halo: "#05070a", opacity: 0.98 };
  if (baseStyle === "satellite") return { country: "#ffffff", region: "#d3dde8", label: "#ffffff", halo: "#1f252c", opacity: 0.95 };
  return { country: "#111827", region: "#4b5563", label: "#111827", halo: "#ffffff", opacity: 0.94 };
}

function setLinePaint(map: MapLibreMap, layerId: string, baseStyle: MapBaseStyle, kind: "country" | "region") {
  const colors = boundaryColors(baseStyle);
  if (kind === "country") {
    map.setPaintProperty(layerId, "line-color", colors.country);
    map.setPaintProperty(layerId, "line-opacity", colors.opacity);
    map.setPaintProperty(layerId, "line-width", ["interpolate", ["linear"], ["zoom"], 1, 0.9, 3, 1.25, 6, 1.85, 9, 2.7]);
    return;
  }

  map.setPaintProperty(layerId, "line-color", colors.region);
  map.setPaintProperty(layerId, "line-opacity", ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 0.24, 8, 0.42, 10, 0.56]);
  map.setPaintProperty(layerId, "line-width", ["interpolate", ["linear"], ["zoom"], 5, 0.16, 7, 0.42, 10, 0.78]);
}

function ensureBoundaryLayers(map: MapLibreMap, baseStyle: MapBaseStyle) {
  const sourceId = map.getSource("openmaptiles") ? "openmaptiles" : BOUNDARY_SOURCE_ID;

  if (sourceId === BOUNDARY_SOURCE_ID && !map.getSource(BOUNDARY_SOURCE_ID)) {
    map.addSource(BOUNDARY_SOURCE_ID, {
      type: "vector",
      url: OPENFREEMAP_VECTOR_URL
    });
  }

  if (!map.getLayer(COUNTRY_BOUNDARY_LAYER_ID)) {
    map.addLayer({
      id: COUNTRY_BOUNDARY_LAYER_ID,
      type: "line",
      source: sourceId,
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1], ["!", ["has", "claimed_by"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {}
    });
  }

  if (!map.getLayer(REGIONAL_BOUNDARY_LAYER_ID)) {
    map.addLayer({
      id: REGIONAL_BOUNDARY_LAYER_ID,
      type: "line",
      source: sourceId,
      "source-layer": "boundary",
      minzoom: 6.4,
      filter: ["all", [">=", ["get", "admin_level"], 3], ["<=", ["get", "admin_level"], 6], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1], ["!", ["has", "claimed_by"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {}
    });
  }

  if (!map.getLayer(COUNTRY_LABEL_LAYER_ID)) {
    const colors = boundaryColors(baseStyle);
    map.addLayer({
      id: COUNTRY_LABEL_LAYER_ID,
      type: "symbol",
      source: sourceId,
      "source-layer": "place",
      maxzoom: 8.5,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 12, 7, 16],
        "text-transform": "uppercase",
        "text-letter-spacing": 0,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 10]
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 1.6,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.78, 3, 0.92]
      }
    });
  }

  setLinePaint(map, COUNTRY_BOUNDARY_LAYER_ID, baseStyle, "country");
  setLinePaint(map, REGIONAL_BOUNDARY_LAYER_ID, baseStyle, "region");
  const colors = boundaryColors(baseStyle);
  map.setPaintProperty(COUNTRY_LABEL_LAYER_ID, "text-color", colors.label);
  map.setPaintProperty(COUNTRY_LABEL_LAYER_ID, "text-halo-color", colors.halo);
}

function ensureMapLayers(
  map: MapLibreMap,
  points: FeatureCollection<Point, MapPointProperties>,
  lines: FeatureCollection<LineString, MapLineProperties>
) {
  const pointSource = map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined;
  if (pointSource) {
    pointSource.setData(points);
  } else {
    map.addSource(POINT_SOURCE_ID, {
      type: "geojson",
      data: points
    });
  }

  const lineSource = map.getSource(LINE_SOURCE_ID) as GeoJSONSource | undefined;
  if (lineSource) {
    lineSource.setData(lines);
  } else {
    map.addSource(LINE_SOURCE_ID, {
      type: "geojson",
      data: lines
    });
  }

  if (!map.getLayer(OUTLIER_LINE_LAYER_ID)) {
    map.addLayer({
      id: OUTLIER_LINE_LAYER_ID,
      type: "line",
      source: LINE_SOURCE_ID,
      filter: ["==", ["get", "lineStyle"], "dashed"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#4b5563"],
        "line-opacity": 0.64,
        "line-width": 1,
        "line-dasharray": [1.5, 1.5]
      }
    });
  }

  if (!map.getLayer(DISPLACEMENT_LINE_LAYER_ID)) {
    map.addLayer({
      id: DISPLACEMENT_LINE_LAYER_ID,
      type: "line",
      source: LINE_SOURCE_ID,
      filter: ["==", ["get", "lineStyle"], "solid"],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#4b5563"],
        "line-opacity": 0.5,
        "line-width": 0.75
      }
    });
  }

  if (!map.getLayer(POINT_LAYER_ID)) {
    map.addLayer({
      id: POINT_LAYER_ID,
      type: "circle",
      source: POINT_SOURCE_ID,
      filter: ["!=", ["get", "kind"], "centroid"],
      paint: {
        "circle-color": ["coalesce", ["get", "markerColor"], "#2f6f4f"],
        "circle-radius": [
          "case",
          ["==", ["get", "kind"], "aggregate"],
          ["step", ["get", "sampleCount"], 16, 25, 19, 100, 23, 300, 27],
          ["==", ["get", "kind"], "group"],
          6.6,
          5.6
        ],
        "circle-stroke-color": ["case", ["==", ["get", "isUnknownColor"], true], "#ffffff", "#ffffff"],
        "circle-stroke-width": ["case", ["==", ["get", "isUnknownColor"], true], 1.35, ["==", ["get", "kind"], "sample"], 0.5, 0.65],
        "circle-opacity": ["case", ["==", ["get", "kind"], "sample"], 0.86, 0.92]
      }
    });
  }

  if (!map.getLayer(CENTROID_LAYER_ID)) {
    map.addLayer({
      id: CENTROID_LAYER_ID,
      type: "symbol",
      source: POINT_SOURCE_ID,
      filter: ["==", ["get", "kind"], "centroid"],
      layout: {
        "text-field": "x",
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["coalesce", ["get", "markerColor"], "#111827"],
        "text-halo-width": 0,
        "text-opacity": 0.86
      }
    });
  }

  if (!map.getLayer(POINT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: POINT_LABEL_LAYER_ID,
      type: "symbol",
      source: POINT_SOURCE_ID,
      filter: ["!=", ["get", "label"], ""],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["case", ["==", ["get", "kind"], "aggregate"], 11.5, 10.5],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0, 0, 0, 0.22)",
        "text-halo-width": 0.6
      }
    });
  }
}

function applyProjection(map: MapLibreMap, projectionMode: MapProjectionMode) {
  map.setProjection({ type: projectionType(projectionMode) });
  map.resize();
  map.triggerRepaint();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === "\"") return "&quot;";
    return "&#039;";
  });
}

function popupHtml(properties: MapPointProperties) {
  let rows: Array<[string, string]> = [];
  try {
    rows = JSON.parse(properties.popupRows || "[]") as Array<[string, string]>;
  } catch {
    rows = [];
  }

  return `
    <div class="map-popup">
      <strong class="map-popup-title">${escapeHtml(properties.title)}</strong>
      ${properties.subtitle ? `<span class="map-popup-subtitle">${escapeHtml(properties.subtitle)}</span>` : ""}
      ${rows.length ? `<dl class="map-popup-facts">${rows.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}</dl>` : ""}
    </div>
  `;
}

function popupRows(properties: MapPointProperties) {
  try {
    return JSON.parse(properties.popupRows || "[]") as Array<[string, string]>;
  } catch {
    return [];
  }
}

function hoverPopupHtml(properties: MapPointProperties) {
  const rows = popupRows(properties);
  const preferred = properties.kind === "sample"
    ? ["Sample", "Date", "Period", "Sex", "Y-DNA", "mtDNA", "SNPs 1240k"]
    : ["Samples", "Date span", "Periods", "Countries", "Localities", "Y-DNA", "mtDNA", "Avg SNPs 1240k"];
  const facts = preferred
    .map((label) => rows.find(([rowLabel]) => rowLabel === label))
    .filter((row): row is [string, string] => Boolean(row))
    .slice(0, properties.kind === "sample" ? 6 : 7);
  const summary =
    properties.kind === "aggregate"
      ? `${properties.groupCount.toLocaleString("en-US")} groups, ${properties.sampleCount.toLocaleString("en-US")} samples`
      : properties.kind === "group"
        ? `${properties.sampleCount.toLocaleString("en-US")} samples`
        : properties.groupId
          ? `Group ${properties.groupId}`
          : "Sample";
  const title = properties.kind === "sample" && properties.groupId ? properties.groupId : properties.title;

  return `
    <div class="map-popup map-popup-compact">
      <strong class="map-popup-title">${escapeHtml(title)}</strong>
      ${properties.subtitle ? `<span class="map-popup-subtitle">${escapeHtml(properties.subtitle)}</span>` : ""}
      <span class="map-popup-summary">${escapeHtml(summary)}</span>
      ${facts.length ? `<dl class="map-popup-facts map-popup-hover-facts">${facts.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}</dl>` : ""}
    </div>
  `;
}

function visibleLineCollection(lines: FeatureCollection<LineString, MapLineProperties> | undefined, showOutlierLinks: boolean) {
  if (!lines) return emptyLineCollection;
  if (showOutlierLinks) return lines;
  return {
    ...lines,
    features: lines.features.filter((feature) => feature.properties.kind !== "outlier")
  };
}

function visiblePointCollection(points: FeatureCollection<Point, MapPointProperties> | undefined, showCentroids: boolean) {
  if (!points) return emptyPointCollection;
  if (showCentroids) return points;
  return {
    ...points,
    features: points.features.filter((feature) => feature.properties.kind !== "centroid")
  };
}

function zoomPercent(map: MapLibreMap) {
  return Math.round(((map.getZoom() - MAP_MIN_ZOOM) / (MAP_MAX_ZOOM - MAP_MIN_ZOOM)) * 100);
}

function MapControlStack({
  baseStyle,
  projectionMode,
  fullView,
  onBaseStyleChange,
  onProjectionModeChange,
  onFullViewChange
}: {
  baseStyle: MapBaseStyle;
  projectionMode: MapProjectionMode;
  fullView: boolean;
  onBaseStyleChange: (style: MapBaseStyle) => void;
  onProjectionModeChange: (mode: MapProjectionMode) => void;
  onFullViewChange: (fullView: boolean) => void;
}) {
  return (
    <>
      <div className="map-control-group" aria-label="View size">
        <button
          className={fullView ? "active" : ""}
          type="button"
          onClick={() => onFullViewChange(!fullView)}
          aria-label={fullView ? "Exit full map" : "Full map"}
          title={fullView ? "Exit full map" : "Full map"}
        >
          {fullView ? <Minimize2 size={15} strokeWidth={2.1} /> : <Maximize2 size={15} strokeWidth={2.1} />}
        </button>
      </div>
      <div className="map-control-group" aria-label="Map style">
        {mapBaseStyles.map((style) => {
          const Icon = mapBaseStyleIcons[style.id];
          return (
            <button
              key={style.id}
              className={baseStyle === style.id ? "active" : ""}
              type="button"
              onClick={() => onBaseStyleChange(style.id)}
              aria-label={`${style.label} map style`}
              title={`${style.label} map style`}
            >
              <Icon size={15} strokeWidth={2.1} />
            </button>
          );
        })}
      </div>
      <div className="map-control-group" aria-label="Projection">
        <button
          className={projectionMode === "flat" ? "active" : ""}
          type="button"
          onClick={() => onProjectionModeChange("flat")}
          aria-label="Flat map"
          title="Flat map"
        >
          <MapIcon size={15} strokeWidth={2.1} />
        </button>
        <button
          className={projectionMode === "globe" ? "active" : ""}
          type="button"
          onClick={() => onProjectionModeChange("globe")}
          aria-label="Globe map"
          title="Globe map"
        >
          <Globe2 size={15} strokeWidth={2.1} />
        </button>
      </div>
    </>
  );
}

export function MapView({
  filter,
  globalSearch,
  searchField,
  baseStyle,
  onBaseStyleChange,
  colorBy,
  colorMode,
  gradientBy,
  presentation,
  combineNearbyGroups,
  showGroupCounts,
  showOutlierLinks,
  showCentroids,
  showLegend,
  fadeLegend,
  fullView,
  onFullViewChange,
  projectionMode,
  onProjectionModeChange,
  onSummaryChange,
  onReviewChange = () => undefined
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoverKeyRef = useRef<string>("");
  const pinnedMarkerRef = useRef<string>("");
  const pointsRef = useRef<FeatureCollection<Point, MapPointProperties>>(emptyPointCollection);
  const linesRef = useRef<FeatureCollection<LineString, MapLineProperties>>(emptyLineCollection);
  const baseStyleRef = useRef(baseStyle);
  const projectionModeRef = useRef(projectionMode);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapQueryResponse | null>(null);
  const [currentZoomPercent, setCurrentZoomPercent] = useState(0);
  const [controlHost, setControlHost] = useState<HTMLElement | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  function syncSources(map = mapRef.current) {
    if (!map || !map.isStyleLoaded()) return;
    ensureMapLayers(map, pointsRef.current, linesRef.current);
    window.setTimeout(() => {
      if (mapRef.current !== map || !map.isStyleLoaded()) return;
      ensureBoundaryLayers(map, baseStyleRef.current);
    }, 0);
  }

  useEffect(() => {
    pointsRef.current = visiblePointCollection(mapData?.features, showCentroids);
    linesRef.current = visibleLineCollection(mapData?.leaderLines, showOutlierLinks);
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      syncSources(map);
      return;
    }
    map.once("idle", () => syncSources(map));
  }, [mapData, showOutlierLinks, showCentroids]);

  useEffect(() => {
    baseStyleRef.current = baseStyle;
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyleDefinition(baseStyle, projectionModeRef.current));
  }, [baseStyle]);

  useEffect(() => {
    projectionModeRef.current = projectionMode;
    const map = mapRef.current;
    if (!map) return;
    const updateProjectionStyle = () => {
      if (!map.isStyleLoaded()) {
        map.once("idle", updateProjectionStyle);
        return;
      }
      map.setStyle(mapStyleDefinition(baseStyleRef.current, projectionMode));
    };
    updateProjectionStyle();
    return () => {
      map.off("idle", updateProjectionStyle);
    };
  }, [projectionMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    window.setTimeout(() => map.resize(), 0);
    window.setTimeout(() => map.resize(), 180);
  }, [fullView]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function createMap() {
      const maplibre = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      let map: MapLibreMap;
      try {
        map = new maplibre.Map({
          container: containerRef.current,
          center: [25, 28],
          zoom: 1.45,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          attributionControl: false,
          style: mapStyleDefinition(baseStyleRef.current, projectionModeRef.current)
        });
      } catch {
        setMapError("Map rendering requires WebGL. Enable hardware acceleration or use the table view.");
        return;
      }

      map.addControl(new maplibre.NavigationControl({ visualizePitch: false }), "top-right");
      const customControls = document.createElement("div");
      customControls.className = "maplibregl-ctrl archaebase-map-view-controls";
      const customControl: IControl = {
        onAdd: () => customControls,
        onRemove: () => customControls.remove()
      };
      map.addControl(customControl, "top-right");
      setControlHost(customControls);
      map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");
      popupRef.current = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: "320px" });
      mapRef.current = map;

      map.on("load", () => {
        applyProjection(map, projectionModeRef.current);
        syncSources(map);
        setCurrentZoomPercent(zoomPercent(map));
        setMapReady(true);
      });
      map.on("style.load", () => {
        applyProjection(map, projectionModeRef.current);
        syncSources(map);
      });
      map.on("idle", () => syncSources(map));

      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(containerRef.current);

      const updateZoom = () => {
        setCurrentZoomPercent(zoomPercent(map));
      };
      map.on("zoom", updateZoom);
      map.on("zoomend", updateZoom);

      const hidePopup = () => {
        map.getCanvas().style.cursor = "";
        hoverKeyRef.current = "";
        if (pinnedMarkerRef.current) return;
        popupRef.current?.remove();
      };

      const showHoverPopup = (feature: Feature<Point, MapPointProperties>, event: MapMouseEvent) => {
        if (pinnedMarkerRef.current) return;
        const coordinates = feature.geometry.coordinates as [number, number];
        const key = `${feature.properties.markerId}:${coordinates[0].toFixed(5)}:${coordinates[1].toFixed(5)}`;
        if (hoverKeyRef.current === key) return;
        hoverKeyRef.current = key;
        map.getCanvas().style.cursor = "pointer";
        popupRef.current?.setLngLat(coordinates ?? [event.lngLat.lng, event.lngLat.lat]).setHTML(hoverPopupHtml(feature.properties)).addTo(map);
      };

      const showPinnedPopup = (feature: Feature<Point, MapPointProperties>) => {
        const coordinates = feature.geometry.coordinates as [number, number];
        pinnedMarkerRef.current = feature.properties.markerId;
        hoverKeyRef.current = "";
        map.getCanvas().style.cursor = "pointer";
        popupRef.current?.setLngLat(coordinates).setHTML(popupHtml(feature.properties)).addTo(map);
      };

      const closePinnedPopup = () => {
        pinnedMarkerRef.current = "";
        hoverKeyRef.current = "";
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      };

      const handleHover = (event: MapMouseEvent) => {
        if (!map.getLayer(POINT_LAYER_ID)) {
          hidePopup();
          return;
        }
        const features = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] }) as unknown as Array<Feature<Point, MapPointProperties>>;
        const feature = features[0];
        if (!feature?.geometry || feature.geometry.type !== "Point") {
          hidePopup();
          return;
        }
        showHoverPopup(feature, event);
      };

      map.on("mousemove", handleHover);
      map.on("mouseleave", hidePopup);
      map.on("click", (event) => {
        if (!map.getLayer(POINT_LAYER_ID)) {
          closePinnedPopup();
          return;
        }
        const features = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] }) as unknown as Array<Feature<Point, MapPointProperties>>;
        const feature = features[0];
        if (!feature?.geometry || feature.geometry.type !== "Point") {
          closePinnedPopup();
          return;
        }
        if (pinnedMarkerRef.current === feature.properties.markerId) {
          closePinnedPopup();
          return;
        }
        showPinnedPopup(feature);
      });
    }

    void createMap();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      setControlHost(null);
      popupRef.current?.remove();
      mapRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const controller = new AbortController();
    async function run() {
      setQueryLoading(true);
      setQueryError(null);
      try {
        const requestBody = {
          filter,
          globalSearch,
          searchField,
          presentation,
          combineNearbyGroups: false,
          colorMode,
          colorBy,
          gradientBy,
          colorTheme: "dark",
          showGroupCounts
        };
        const cacheKey = JSON.stringify(requestBody);
        const cached = mapResponseCache.get(cacheKey);
        if (cached) {
          setMapData(cached);
          onSummaryChange(cached.summary, cached.release);
          onReviewChange({ unmappedSamples: cached.unmappedSamples, coordinateIssues: cached.coordinateIssues });
          return;
        }
        const response = await fetch("/api/map/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(requestBody)
        });
        const data = (await response.json()) as MapQueryResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Map query failed");
        mapResponseCache.set(cacheKey, data);
        if (mapResponseCache.size > 12) {
          const oldestKey = mapResponseCache.keys().next().value;
          if (oldestKey) mapResponseCache.delete(oldestKey);
        }
        setMapData(data);
        onSummaryChange(data.summary, data.release);
        onReviewChange({ unmappedSamples: data.unmappedSamples, coordinateIssues: data.coordinateIssues });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setQueryError(error instanceof Error ? error.message : "Map query failed");
      } finally {
        setQueryLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [filter, globalSearch, searchField, mapReady, presentation, combineNearbyGroups, colorBy, colorMode, gradientBy, showGroupCounts, onSummaryChange, onReviewChange]);

  const mapStatus = mapData?.summary;
  const pointCount = mapData?.features.features.filter((feature) => feature.properties.kind !== "centroid").length ?? 0;
  const statusPrimary = presentation === "group_locations" ? mapStatus?.renderedGroups ?? pointCount : mapStatus?.renderedSamples ?? pointCount;
  const statusLabel = presentation === "group_locations" ? "groups" : "samples";

  return (
    <div className={`map-view map-base-${baseStyle} map-projection-${projectionMode} ${fadeLegend ? "map-legend-fade" : ""}`}>
      <div ref={containerRef} className="map-canvas" />
      {mapError ? (
        <div className="map-empty">
          <strong>Map unavailable</strong>
          <span>{mapError}</span>
        </div>
      ) : null}
      <div className="map-status">
        <strong>{new Intl.NumberFormat("en-US").format(statusPrimary)}</strong>
        <span>{statusLabel}</span>
        <small>
          {queryLoading ? "Loading cache" : `${new Intl.NumberFormat("en-US").format(mapStatus?.totalMatched ?? 0)} matched`}
        </small>
        <small>Zoom {currentZoomPercent}%</small>
      </div>
      {controlHost
        ? createPortal(
            <MapControlStack
              baseStyle={baseStyle}
              projectionMode={projectionMode}
              fullView={fullView}
              onBaseStyleChange={onBaseStyleChange}
              onProjectionModeChange={onProjectionModeChange}
              onFullViewChange={onFullViewChange}
            />,
            controlHost
          )
        : null}
      {showLegend ? <MapLegendPanel legend={mapData?.legend ?? null} collapsed={legendCollapsed} onCollapsedChange={setLegendCollapsed} /> : null}
      {queryError ? (
        <div className="map-empty">
          <strong>Map query failed</strong>
          <span>{queryError}</span>
        </div>
      ) : null}
      {!queryLoading && !queryError && mapData && !pointCount ? (
        <div className="map-empty">
          <strong>No mapped rows</strong>
          <span>Current filters did not return reviewable coordinates in this map area.</span>
        </div>
      ) : null}
    </div>
  );
}

function formatLegendCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function MapLegendPanel({
  legend,
  collapsed,
  onCollapsedChange
}: {
  legend: MapLegend | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  if (!legend) return null;
  const legendClass = legend.kind === "gradient" ? "gradient" : "categorical";
  if (collapsed) {
    return (
      <button
        className={`map-legend-toggle map-legend-toggle-${legendClass}`}
        type="button"
        onClick={() => onCollapsedChange(false)}
        title="Show legend"
        aria-label="Show legend"
      >
        <Eye size={13} />
        <span>Legend</span>
      </button>
    );
  }

  if (legend.kind === "gradient") {
    const gradient = legend.stops.length
      ? `linear-gradient(90deg, ${legend.stops.map((stop, index) => `${stop.color} ${(index / Math.max(1, legend.stops.length - 1)) * 100}%`).join(", ")})`
      : "#64748b";
    const segmented = Boolean(legend.segments?.length);
    return (
      <div className={`map-legend map-legend-gradient ${segmented ? "map-legend-segmented" : ""}`}>
        <div className="map-legend-header">
          <strong>{legend.title}</strong>
          <button type="button" onClick={() => onCollapsedChange(true)} title="Hide legend" aria-label="Hide legend">
            <EyeOff size={13} />
          </button>
        </div>
        {segmented ? (
          <>
            <div className="map-gradient-segments">
              {legend.segments?.map((segment) => (
                <div
                  className="map-gradient-segment"
                  key={`${segment.label}:${segment.min}:${segment.max}:bar`}
                  style={{
                    background: `linear-gradient(90deg, ${segment.startColor}, ${segment.endColor})`
                  }}
                  title={`${segment.label}: ${formatLegendCount(segment.count)} samples, ${segment.min.toLocaleString("en-US")} to ${segment.max.toLocaleString("en-US")} BP`}
                >
                  {segment.marks?.length ? (
                    <div className="map-gradient-segment-ticks">
                      {segment.marks.map((mark, index) => (
                        <i
                          key={`${segment.label}:${mark}:tick`}
                          style={{ left: `${((index + 0.5) / segment.marks!.length) * 100}%` }}
                          title={mark}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="map-gradient-segment-labels">
              {legend.segments?.map((segment) => (
                <div
                  key={`${segment.label}:${segment.min}:${segment.max}:label`}
                >
                  <b>{segment.label}</b>
                  {segment.marks?.length ? (
                    <em
                      className="map-gradient-period-labels"
                      style={{ gridTemplateColumns: `repeat(${segment.marks.length}, minmax(0, 1fr))` }}
                    >
                      {segment.marks.map((mark) => (
                        <i key={`${segment.label}:${mark}:label`}>{mark}</i>
                      ))}
                    </em>
                  ) : segment.subLabel ? <em>{segment.subLabel}</em> : null}
                  <small>{segment.max.toLocaleString("en-US")}-{segment.min.toLocaleString("en-US")} BP</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="map-gradient-bar" style={{ background: gradient }} />
            <div className="map-gradient-ticks">
              {legend.ticks.map((tick) => (
                <span key={`${tick.value}:${tick.label}`}>{tick.label}</span>
              ))}
            </div>
          </>
        )}
        {legend.unknownCount ? <small>Unknown {formatLegendCount(legend.unknownCount)}</small> : null}
      </div>
    );
  }

  if (!legend.items.length) return null;
  return (
    <div className="map-legend map-legend-categorical">
      <div className="map-legend-header">
        <strong>{legend.title}</strong>
        <button type="button" onClick={() => onCollapsedChange(true)} title="Hide legend" aria-label="Hide legend">
          <EyeOff size={13} />
        </button>
      </div>
      {legend.items.map((item) => (
        <span key={item.label} title={`${item.label}: ${formatLegendCount(item.count)}`}>
          <i style={{ background: item.color }} />
          {item.label}
          <b>{formatLegendCount(item.count)}</b>
        </span>
      ))}
    </div>
  );
}
