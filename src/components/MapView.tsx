"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Popup, StyleSpecification } from "maplibre-gl";
import type { FilterNode, MapBounds } from "@/lib/filters/types";
import type {
  MapColorBy,
  MapLineProperties,
  MapPointProperties,
  MapPresentation,
  MapQueryResponse,
  MapQuerySummary,
  MapViewport
} from "@/lib/map/types";

export type MapBaseStyle = "dark" | "light" | "streets" | "satellite";
export type MapProjectionMode = "flat" | "globe";
export type { MapColorBy, MapPresentation };

type Props = {
  filter: FilterNode;
  globalSearch: string;
  searchField: string | null;
  baseStyle: MapBaseStyle;
  colorBy: MapColorBy;
  presentation: MapPresentation;
  combineNearbyGroups: boolean;
  projectionMode: MapProjectionMode;
  onSummaryChange: (summary: MapQuerySummary, release: MapQueryResponse["release"]) => void;
  onReviewChange: (review: Pick<MapQueryResponse, "unmappedSamples" | "coordinateIssues">) => void;
};

type LegendItem = {
  label: string;
  color: string;
  count: number;
};

type ViewState = {
  bounds: MapBounds;
  zoom: number;
  viewport: MapViewport;
};

const POINT_SOURCE_ID = "archaebase-map-points";
const LINE_SOURCE_ID = "archaebase-map-lines";
const DISPLACEMENT_LINE_LAYER_ID = "archaebase-displacement-lines";
const OUTLIER_LINE_LAYER_ID = "archaebase-outlier-lines";
const POINT_LAYER_ID = "archaebase-map-point-circles";
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

export const mapBaseStyles: { id: MapBaseStyle; label: string; swatch: string }[] = [
  { id: "dark", label: "Dark", swatch: "#111217" },
  { id: "light", label: "Light", swatch: "#f5f4ef" },
  { id: "streets", label: "Streets", swatch: "#f8f3c7" },
  { id: "satellite", label: "Satellite", swatch: "#3e4a59" }
];

export const mapColorOptions: { id: MapColorBy; label: string }[] = [
  { id: "default", label: "Single color" },
  { id: "sex", label: "Molecular sex" },
  { id: "period", label: "Period" },
  { id: "country", label: "Political entity" },
  { id: "data_type", label: "Data type" },
  { id: "assessment", label: "Assessment" },
  { id: "sample_count", label: "Sample count" },
  { id: "multi_site", label: "Site spread" }
];

export const mapPresentationOptions: { id: MapPresentation; label: string }[] = [
  { id: "smart_split", label: "Smart Split" },
  { id: "group_locations", label: "Group Locations" },
  { id: "sample_cloud", label: "Sample Cloud" }
];

function esriTileUrl(service: string) {
  return `${ESRI_BASE_URL}/${service}/MapServer/tile/{z}/{y}/{x}`;
}

function rasterSource(service: string, attribution = "Tiles © Esri") {
  return {
    type: "raster" as const,
    tiles: [esriTileUrl(service)],
    tileSize: 256,
    attribution
  };
}

function mapStyleDefinition(baseStyle: MapBaseStyle): StyleSpecification {
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
    sources: selected.sources,
    layers: selected.layers
  };
}

function boundaryColors(baseStyle: MapBaseStyle) {
  if (baseStyle === "dark") return { country: "#d7dde3", region: "#77838d", label: "#f4f4f2", halo: "#121417", opacity: 0.92 };
  if (baseStyle === "satellite") return { country: "#ffffff", region: "#d3dde8", label: "#ffffff", halo: "#1f252c", opacity: 0.95 };
  return { country: "#30372f", region: "#8a9287", label: "#2a3029", halo: "#f6f5f0", opacity: 0.86 };
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
      paint: {
        "circle-color": ["coalesce", ["get", "markerColor"], "#2f6f4f"],
        "circle-radius": [
          "case",
          ["==", ["get", "kind"], "aggregate"],
          ["step", ["get", "sampleCount"], 16, 25, 19, 100, 23, 300, 27],
          ["==", ["get", "kind"], "group"],
          ["interpolate", ["linear"], ["get", "sampleCount"], 1, 6, 10, 8, 50, 11, 200, 14],
          4
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["==", ["get", "kind"], "sample"], 0.4, 0.9],
        "circle-opacity": ["case", ["==", ["get", "kind"], "sample"], 0.86, 0.92]
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
  map.setProjection({ type: projectionMode === "globe" ? "globe" : "mercator" });
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

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

function buildLegend(collection: FeatureCollection<Point, MapPointProperties>) {
  const groups = new Map<string, LegendItem>();
  for (const feature of collection.features) {
    const label = feature.properties.colorLabel || "Unknown";
    const current = groups.get(label);
    if (current) {
      current.count += 1;
    } else {
      groups.set(label, { label, color: feature.properties.markerColor, count: 1 });
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 9);
}

function readViewState(map: MapLibreMap, container: HTMLDivElement | null): ViewState {
  const bounds = map.getBounds();
  const rect = container?.getBoundingClientRect();
  return {
    bounds: {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth()
    },
    zoom: map.getZoom(),
    viewport: {
      width: Math.round(rect?.width || map.getContainer().clientWidth || 1280),
      height: Math.round(rect?.height || map.getContainer().clientHeight || 720)
    }
  };
}

function queryKey(state: ViewState | null) {
  if (!state) return "";
  return [
    state.zoom.toFixed(2),
    state.viewport.width,
    state.viewport.height,
    state.bounds.west.toFixed(3),
    state.bounds.south.toFixed(3),
    state.bounds.east.toFixed(3),
    state.bounds.north.toFixed(3)
  ].join(":");
}

export function MapView({
  filter,
  globalSearch,
  searchField,
  baseStyle,
  colorBy,
  presentation,
  combineNearbyGroups,
  projectionMode,
  onSummaryChange,
  onReviewChange
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoverKeyRef = useRef<string>("");
  const pointsRef = useRef<FeatureCollection<Point, MapPointProperties>>(emptyPointCollection);
  const linesRef = useRef<FeatureCollection<LineString, MapLineProperties>>(emptyLineCollection);
  const baseStyleRef = useRef(baseStyle);
  const projectionModeRef = useRef(projectionMode);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapQueryResponse | null>(null);

  const debouncedViewState = useDebouncedValue(viewState, 140);
  const legendItems = useMemo(() => buildLegend(mapData?.features ?? emptyPointCollection), [mapData]);

  function syncSources(map = mapRef.current) {
    if (!map || !map.isStyleLoaded()) return;
    ensureMapLayers(map, pointsRef.current, linesRef.current);
    window.setTimeout(() => {
      if (mapRef.current !== map || !map.isStyleLoaded()) return;
      ensureBoundaryLayers(map, baseStyleRef.current);
    }, 0);
  }

  useEffect(() => {
    pointsRef.current = mapData?.features ?? emptyPointCollection;
    linesRef.current = mapData?.leaderLines ?? emptyLineCollection;
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      syncSources(map);
      return;
    }
    map.once("idle", () => syncSources(map));
  }, [mapData]);

  useEffect(() => {
    baseStyleRef.current = baseStyle;
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyleDefinition(baseStyle));
  }, [baseStyle]);

  useEffect(() => {
    projectionModeRef.current = projectionMode;
    const map = mapRef.current;
    if (!map) return;
    const updateProjection = () => {
      if (!map.isStyleLoaded()) {
        map.once("idle", updateProjection);
        return;
      }
      applyProjection(map, projectionMode);
      syncSources(map);
    };
    updateProjection();
    if (projectionMode === "globe" && map.getZoom() > 5.2) {
      map.easeTo({ zoom: 5.2, duration: 260 });
    }
    return () => {
      map.off("idle", updateProjection);
    };
  }, [projectionMode]);

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
          minZoom: 1,
          maxZoom: 10,
          attributionControl: false,
          style: mapStyleDefinition(baseStyleRef.current)
        });
      } catch {
        setMapError("Map rendering requires WebGL. Enable hardware acceleration or use the table view.");
        return;
      }

      map.addControl(new maplibre.NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");
      popupRef.current = new maplibre.Popup({ closeButton: false, closeOnClick: true, offset: 14, maxWidth: "300px" });
      mapRef.current = map;

      const emitViewState = () => {
        if (disposed || !containerRef.current) return;
        setViewState(readViewState(map, containerRef.current));
      };

      map.on("load", () => {
        applyProjection(map, projectionModeRef.current);
        syncSources(map);
        emitViewState();
      });
      map.on("style.load", () => {
        applyProjection(map, projectionModeRef.current);
        syncSources(map);
      });
      map.on("idle", () => syncSources(map));
      map.on("moveend", emitViewState);
      map.on("zoomend", emitViewState);

      resizeObserver = new ResizeObserver(() => {
        map.resize();
        emitViewState();
      });
      resizeObserver.observe(containerRef.current);

      const hidePopup = () => {
        map.getCanvas().style.cursor = "";
        hoverKeyRef.current = "";
        popupRef.current?.remove();
      };

      const showPopup = (feature: Feature<Point, MapPointProperties>, event: MapMouseEvent) => {
        const coordinates = feature.geometry.coordinates as [number, number];
        const key = `${feature.properties.markerId}:${coordinates[0].toFixed(5)}:${coordinates[1].toFixed(5)}`;
        if (hoverKeyRef.current === key) return;
        hoverKeyRef.current = key;
        map.getCanvas().style.cursor = "pointer";
        popupRef.current?.setLngLat(coordinates ?? [event.lngLat.lng, event.lngLat.lat]).setHTML(popupHtml(feature.properties)).addTo(map);
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
        showPopup(feature, event);
      };

      map.on("mousemove", handleHover);
      map.on("mouseleave", hidePopup);
      map.on("click", (event) => {
        if (!map.getLayer(POINT_LAYER_ID)) return;
        const features = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER_ID] }) as unknown as Array<Feature<Point, MapPointProperties>>;
        const feature = features[0];
        if (!feature || feature.properties.kind !== "aggregate") return;
        map.easeTo({ center: event.lngLat, zoom: Math.min(map.getZoom() + 2, 10), duration: 260 });
      });
    }

    void createMap();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      popupRef.current?.remove();
      mapRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!debouncedViewState) return;
    const state = debouncedViewState;
    const controller = new AbortController();
    async function run() {
      setQueryLoading(true);
      setQueryError(null);
      try {
        const response = await fetch("/api/map/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            filter,
            globalSearch,
            searchField,
            bounds: state.bounds,
            zoom: state.zoom,
            viewport: state.viewport,
            presentation,
            combineNearbyGroups: presentation === "smart_split" ? combineNearbyGroups : false,
            colorBy
          })
        });
        const data = (await response.json()) as MapQueryResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Map query failed");
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
  }, [filter, globalSearch, searchField, debouncedViewState, presentation, combineNearbyGroups, colorBy, onSummaryChange, onReviewChange]);

  const mapStatus = mapData?.summary;
  const pointCount = mapData?.features.features.length ?? 0;
  const activeQueryKey = queryKey(debouncedViewState);

  return (
    <div className={`map-view map-base-${baseStyle} map-projection-${projectionMode}`} data-query-key={activeQueryKey}>
      <div ref={containerRef} className="map-canvas" />
      {mapError ? (
        <div className="map-empty">
          <strong>Map unavailable</strong>
          <span>{mapError}</span>
        </div>
      ) : null}
      <div className="map-status">
        <strong>{new Intl.NumberFormat("en-US").format(pointCount)}</strong>
        <span>{presentation === "sample_cloud" ? "sample markers" : presentation === "group_locations" ? "group markers" : "map markers"}</span>
        <small>
          {queryLoading ? "Updating" : `${new Intl.NumberFormat("en-US").format(mapStatus?.totalMatched ?? 0)} matched`}
        </small>
      </div>
      {legendItems.length ? (
        <div className="map-legend">
          {legendItems.map((item) => (
            <span key={item.label} title={`${item.label}: ${item.count}`}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
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
