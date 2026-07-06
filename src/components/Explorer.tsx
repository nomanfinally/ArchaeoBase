"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { AlertCircle, ArrowUpDown, Columns3, Copy, Download, Edit3, Filter, GripVertical, Map as MapIcon, Plus, RefreshCw, Search, Settings2, Table2, Trash2, Upload, X } from "lucide-react";
import type { FilterNode, SortSpec } from "@/lib/filters/types";
import type { MapQueryResponse } from "@/lib/map/types";
import {
  PROFILE_FILE_EXTENSION,
  parseProfileText,
  stringifyProfileFile,
  type ProfileFile,
  type ProfileView
} from "@/lib/profiles";
import type { FieldDefinition, Operator } from "@/lib/schema/fields";
import { DataTable } from "./DataTable";
import { FilterBuilder } from "./FilterBuilder";
import {
  MapView,
  mapFixedColorOptions,
  mapGradientOptions,
  type MapBaseStyle,
  type MapColorBy,
  type MapColorMode,
  type MapGradientBy,
  type MapPresentation,
  type MapProjectionMode
} from "./MapView";
import {
  defaultPeriodOptions,
  fullTimeWindow,
  isFullTimeWindow,
  periodStorageKey,
  TimePeriodSettings,
  TimeWindow,
  TimeWindowPanel,
  validStoredPeriods,
  type TimeMode,
  type PeriodOption,
  type TimeWindowValue
} from "./TimeWindow";

type Entity = "sample" | "group";
type ViewMode = "table" | "map";
type PanelMode = "filters" | "sort" | "columns" | "settings" | null;

type SchemaResponse = {
  sampleFields: FieldDefinition[];
  groupFields: FieldDefinition[];
  filterableFields: FieldDefinition[];
  operatorsByKind: Record<string, Operator[]>;
  defaults: {
    sample: string[];
    group: string[];
  };
};

type AdmixtureRun = {
  id: number;
  name: string;
  k: number;
  components: { componentIndex: number; colorHex: string; label: string | null }[];
};

type MapReviewData = Pick<MapQueryResponse, "unmappedSamples" | "coordinateIssues">;

const emptyFilter: FilterNode = {
  type: "group",
  op: "and",
  children: []
};

const explorerStorageKey = "archaebase:explorer-state:v1";
const MAX_SORT_RULES = 8;
const DEFAULT_PANEL_WIDTH = 420;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const CSV_EXPORT_PAGE_SIZE = 500;

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeRows(rows: Record<string, unknown>[], entity: Entity): Record<string, unknown>[] {
  if (entity === "sample") return rows;
  return rows.map((row) => ({
    ...row,
    countries: Array.isArray(row.countries) ? row.countries : row.countries_text,
    date_min_bp: row.date_min_bp,
    date_max_bp: row.date_max_bp,
    snp_1240k_avg: row.snp_1240k_avg
  }));
}

function orderFieldsByColumnIds(fields: FieldDefinition[], columnIds: string[]) {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  return columnIds.map((fieldId) => fieldById.get(fieldId)).filter((field): field is FieldDefinition => Boolean(field));
}

function clampPanelWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

function sortingToSortSpecs(sorting: SortingState): SortSpec[] {
  return sorting.slice(0, MAX_SORT_RULES).map((entry) => ({ field: entry.id, direction: entry.desc ? "desc" : "asc" }));
}

function sortSpecsToSorting(sort: SortSpec[] | undefined): SortingState {
  return (sort ?? []).slice(0, MAX_SORT_RULES).map((entry) => ({ id: entry.field, desc: entry.direction === "desc" }));
}

function sanitizeColumnIds(ids: string[] | undefined, fields: FieldDefinition[], fallback: string[]) {
  const known = new Set(fields.map((field) => field.id));
  const next = (ids ?? []).filter((id, index, list) => known.has(id) && list.indexOf(id) === index);
  return next.length ? next : fallback;
}

function sanitizeColumnWidths(widths: Record<string, number> | undefined, fields: FieldDefinition[]) {
  const known = new Set(fields.map((field) => field.id).concat("admixture"));
  return Object.fromEntries(
    Object.entries(widths ?? {})
      .filter(([fieldId, width]) => known.has(fieldId) && Number.isFinite(width))
      .map(([fieldId, width]) => [fieldId, Math.min(520, Math.max(92, Math.round(width)))])
  );
}

function sortDirectionLabels(field: FieldDefinition | undefined) {
  if (field?.kind === "number") return { asc: "0 -> 9", desc: "9 -> 0" };
  if (field?.kind === "year") return { asc: "Old -> New", desc: "New -> Old" };
  return { asc: "A -> Z", desc: "Z -> A" };
}

function emptyProfile(name = "Default View"): ProfileFile {
  return {
    version: 1,
    activeView: name,
    views: []
  };
}

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value)
    ? value.join("; ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function countConditions(node: FilterNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((total, child) => total + countConditions(child), 0);
}

function combineWithTimeWindow(filter: FilterNode, timeWindow: TimeWindowValue): FilterNode {
  if (isFullTimeWindow(timeWindow)) return filter;
  const intervals = timeWindow.intervals?.length ? timeWindow.intervals : [{ startYear: timeWindow.startYear, endYear: timeWindow.endYear }];

  return {
    type: "group",
    op: "and",
    children: [
      filter,
      intervals.length === 1
        ? {
            type: "condition",
            field: "date_mean_year_ce",
            operator: "between",
            value: [intervals[0].startYear, intervals[0].endYear]
          }
        : {
            type: "group",
            op: "or",
            children: intervals.map((interval) => ({
              type: "condition",
              field: "date_mean_year_ce",
              operator: "between",
              value: [interval.startYear, interval.endYear]
            }))
          }
    ]
  };
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

export function Explorer() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [entity, setEntity] = useState<Entity>("sample");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchField, setSearchField] = useState("group_id");
  const [filterDraft, setFilterDraft] = useState<FilterNode>(emptyFilter);
  const [filter, setFilter] = useState<FilterNode>(emptyFilter);
  const [visibleColumns, setVisibleColumns] = useState<Record<Entity, string[]>>({ sample: [], group: [] });
  const [columnWidths, setColumnWidths] = useState<Record<Entity, Record<string, number>>>({ sample: {}, group: {} });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [releaseName, setReleaseName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AdmixtureRun[]>([]);
  const [admixtureRunId, setAdmixtureRunId] = useState<number | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindowValue>(fullTimeWindow);
  const [timeMode, setTimeMode] = useState<TimeMode>("calendar");
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>(defaultPeriodOptions);
  const [periodOptionsHydrated, setPeriodOptionsHydrated] = useState(false);
  const [mapBaseStyle, setMapBaseStyle] = useState<MapBaseStyle>("light");
  const [mapColorMode, setMapColorMode] = useState<MapColorMode>("fixed");
  const [mapColorBy, setMapColorBy] = useState<MapColorBy>("sex");
  const [mapGradientBy, setMapGradientBy] = useState<MapGradientBy>("snp_1240k");
  const [mapPresentation, setMapPresentation] = useState<MapPresentation>("sample_cloud");
  const [mapShowGroupCounts, setMapShowGroupCounts] = useState(true);
  const [mapShowOutlierLinks, setMapShowOutlierLinks] = useState(false);
  const [mapShowCentroids, setMapShowCentroids] = useState(true);
  const [mapShowLegend, setMapShowLegend] = useState(true);
  const [mapFadeLegend, setMapFadeLegend] = useState(true);
  const [mapFullView, setMapFullView] = useState(false);
  const [mapProjectionMode, setMapProjectionMode] = useState<MapProjectionMode>("flat");
  const [mapTotal, setMapTotal] = useState(0);
  const [mapReview, setMapReview] = useState<MapReviewData | null>(null);
  const [mapIssuePopoverOpen, setMapIssuePopoverOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [timePanelOpen, setTimePanelOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileFile>(() => emptyProfile());
  const [activeProfileName, setActiveProfileName] = useState("Default View");
  const [persistHydrated, setPersistHydrated] = useState(false);
  const [draggedProperty, setDraggedProperty] = useState<string | null>(null);
  const [propertyDropTarget, setPropertyDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [draggedSortIndex, setDraggedSortIndex] = useState<number | null>(null);
  const [sortDropTarget, setSortDropTarget] = useState<{ index: number; position: "before" | "after" } | null>(null);
  const profileImportRef = useRef<HTMLInputElement | null>(null);
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const tableQueryCacheRef = useRef(new Map<string, { rows: Record<string, unknown>[]; total: number; releaseName: string | null }>());

  useEffect(() => {
    async function loadSchema() {
      const response = await fetch("/api/schema/fields");
      const data = (await response.json()) as SchemaResponse;
      setSchema(data);
      setVisibleColumns({ sample: data.defaults.sample, group: data.defaults.group });
    }

    async function loadAdmixtureRuns() {
      const response = await fetch("/api/admixture/runs");
      const data = (await response.json()) as { runs: AdmixtureRun[] };
      setRuns(data.runs ?? []);
    }

    void loadSchema();
    void loadAdmixtureRuns();
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(periodStorageKey);
      if (stored) {
        const parsed = validStoredPeriods(JSON.parse(stored));
        if (parsed) setPeriodOptions(parsed);
      }
    } catch {
      setPeriodOptions(defaultPeriodOptions);
    } finally {
      setPeriodOptionsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!periodOptionsHydrated) return;
    window.localStorage.setItem(periodStorageKey, JSON.stringify(periodOptions));
  }, [periodOptions, periodOptionsHydrated]);

  function buildCurrentProfileView(name = activeProfileName): ProfileView {
    return {
      name,
      type: viewMode,
      entity,
      filters: filter,
      sort: sortingToSortSpecs(sorting),
      order: visibleColumns,
      columnSize: columnWidths,
      search: {
        query: globalSearch,
        field: searchField
      },
      timeWindow,
      timeMode,
      periods: periodOptions,
      admixtureRunId,
      pageSize,
      map: {
        baseStyle: mapBaseStyle,
        colorMode: mapColorMode,
        colorBy: mapColorBy,
        gradientBy: mapGradientBy,
        presentation: mapPresentation,
        showGroupCounts: mapShowGroupCounts,
        showOutlierLinks: mapShowOutlierLinks,
        showCentroids: mapShowCentroids,
        showLegend: mapShowLegend,
        fadeLegend: mapFadeLegend,
        projectionMode: mapProjectionMode
      },
      panel: {
        rightWidth: panelWidth,
        timeOpen: timePanelOpen
      }
    };
  }

  function applyProfileView(view: ProfileView) {
    if (!schema) return;
    const sampleColumns = sanitizeColumnIds(view.order?.sample, schema.sampleFields, schema.defaults.sample);
    const groupColumns = sanitizeColumnIds(view.order?.group, schema.groupFields, schema.defaults.group);
    setActiveProfileName(view.name);
    setViewMode(view.type);
    setEntity(view.entity);
    setFilter(view.filters ?? emptyFilter);
    setFilterDraft(view.filters ?? emptyFilter);
    setSorting(sortSpecsToSorting(view.sort));
    setVisibleColumns({ sample: sampleColumns, group: groupColumns });
    setColumnWidths({
      sample: sanitizeColumnWidths(view.columnSize?.sample, schema.sampleFields),
      group: sanitizeColumnWidths(view.columnSize?.group, schema.groupFields)
    });
    setGlobalSearch(view.search?.query ?? "");
    setSearchField(view.search?.field ?? "group_id");
    if (view.timeWindow) setTimeWindow(view.timeWindow);
    setTimeMode(view.timeMode === "bp" ? "bp" : "calendar");
    if (view.periods?.length) setPeriodOptions(view.periods);
    setAdmixtureRunId(view.admixtureRunId ?? null);
    setPageSize(view.pageSize && view.pageSize > 0 ? view.pageSize : 100);
    setMapBaseStyle((view.map?.baseStyle as MapBaseStyle) ?? "light");
    setMapColorMode((view.map?.colorMode as MapColorMode) ?? "fixed");
    setMapColorBy((view.map?.colorBy as MapColorBy) ?? "sex");
    setMapGradientBy((view.map?.gradientBy as MapGradientBy) ?? "snp_1240k");
    setMapPresentation((view.map?.presentation as MapPresentation) ?? "sample_cloud");
    setMapShowGroupCounts(view.map?.showGroupCounts !== false);
    setMapShowOutlierLinks(Boolean(view.map?.showOutlierLinks));
    setMapShowCentroids(view.map?.showCentroids !== false);
    setMapShowLegend(view.map?.showLegend !== false);
    setMapFadeLegend(view.map?.fadeLegend !== false);
    setMapProjectionMode((view.map?.projectionMode as MapProjectionMode) ?? "flat");
    setPanelWidth(clampPanelWidth(view.panel?.rightWidth ?? DEFAULT_PANEL_WIDTH));
    setTimePanelOpen(Boolean(view.panel?.timeOpen));
    setPage(1);
    setPanelMode(null);
  }

  useEffect(() => {
    if (!schema || persistHydrated) return;
    try {
      const stored = window.localStorage.getItem(explorerStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = parseProfileText(stringifyProfileFile(parsed), schema);
        setProfiles(normalized);
        const active = normalized.views.find((view) => view.name === normalized.activeView) ?? normalized.views[0];
        if (active) applyProfileView(active);
      } else {
        const initial = buildCurrentProfileView("Default View");
        setProfiles({ version: 1, activeView: initial.name, views: [initial] });
      }
    } catch {
      const initial = buildCurrentProfileView("Default View");
      setProfiles({ version: 1, activeView: initial.name, views: [initial] });
    } finally {
      setPersistHydrated(true);
    }
  }, [schema, persistHydrated]);

  useEffect(() => {
    if (!schema || !persistHydrated) return;
    const currentView = buildCurrentProfileView(activeProfileName);
    const nextProfiles: ProfileFile = {
      version: 1,
      activeView: activeProfileName,
      views: profiles.views.length
        ? profiles.views.map((view) => (view.name === activeProfileName ? currentView : view))
        : [currentView]
    };
    try {
      window.localStorage.setItem(explorerStorageKey, JSON.stringify(nextProfiles));
    } catch {
      // Local persistence is best-effort; the app remains usable without it.
    }
  }, [
    schema,
    persistHydrated,
    activeProfileName,
    profiles.views,
    viewMode,
    entity,
    filter,
    sorting,
    visibleColumns,
    columnWidths,
    globalSearch,
    searchField,
    timeWindow,
    timeMode,
    periodOptions,
    admixtureRunId,
    pageSize,
    mapBaseStyle,
    mapColorMode,
    mapColorBy,
    mapGradientBy,
    mapPresentation,
    mapShowGroupCounts,
    mapShowOutlierLinks,
    mapShowCentroids,
    mapShowLegend,
    mapFadeLegend,
    mapProjectionMode,
    panelWidth,
    timePanelOpen
  ]);

  const allFields = useMemo(() => {
    if (!schema) return [];
    return entity === "sample" ? schema.sampleFields : schema.groupFields;
  }, [schema, entity]);
  const activeFields = useMemo(
    () => orderFieldsByColumnIds(allFields, visibleColumns[entity] ?? []),
    [allFields, visibleColumns, entity]
  );

  const displayedRows = useMemo(() => normalizeRows(rows, entity), [rows, entity]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const appliedFilterCount = countConditions(filter);
  const debouncedSearch = useDebouncedValue(globalSearch, 180);
  const debouncedTimeWindow = useDebouncedValue(timeWindow, viewMode === "map" ? 260 : 80);
  const queryFilter = useMemo(() => combineWithTimeWindow(filter, debouncedTimeWindow), [filter, debouncedTimeWindow]);

  useEffect(() => {
    const allowed = mapFixedColorOptions.some((option) => option.id === mapColorBy);
    if (!allowed) setMapColorBy("sex");
  }, [mapColorBy]);

  useEffect(() => {
    const allowed = mapGradientOptions.some((option) => option.id === mapGradientBy);
    if (!allowed) setMapGradientBy("snp_1240k");
  }, [mapGradientBy]);

  useEffect(() => {
    if (!schema || viewMode === "map") return;

    const sort = sortingToSortSpecs(sorting);
    const requestBody = {
      entity,
      view: viewMode,
      filter: queryFilter,
      globalSearch: debouncedSearch,
      searchField,
      sort,
      page,
      pageSize,
      admixtureRunId,
      mapBounds: null
    };
    const tableCacheKey = JSON.stringify(requestBody);
    const cachedTableQuery = tableQueryCacheRef.current.get(tableCacheKey);
    if (cachedTableQuery) {
      setRows(cachedTableQuery.rows);
      setTotal(cachedTableQuery.total);
      setReleaseName(cachedTableQuery.releaseName);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Query failed");
        }
        const nextRows = data.rows ?? [];
        const nextTotal = data.total ?? 0;
        const nextReleaseName = data.release?.name ?? null;
        setRows(nextRows);
        setTotal(nextTotal);
        setReleaseName(nextReleaseName);
        tableQueryCacheRef.current.set(tableCacheKey, { rows: nextRows, total: nextTotal, releaseName: nextReleaseName });
        if (tableQueryCacheRef.current.size > 20) {
          const oldestKey = tableQueryCacheRef.current.keys().next().value;
          if (oldestKey) tableQueryCacheRef.current.delete(oldestKey);
        }
      } catch (queryError) {
        if (queryError instanceof DOMException && queryError.name === "AbortError") return;
        setRows([]);
        setTotal(0);
        setError(queryError instanceof Error ? queryError.message : "Query failed");
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [schema, entity, viewMode, queryFilter, debouncedSearch, searchField, sorting, page, pageSize, admixtureRunId]);

  function toggleColumn(fieldId: string) {
    setVisibleColumns((current) => {
      const active = current[entity];
      const next = active.includes(fieldId) ? active.filter((id) => id !== fieldId) : [...active, fieldId];
      return { ...current, [entity]: next };
    });
  }

  function reorderVisibleColumn(draggedId: string, targetId: string, position: "before" | "after" = "before") {
    if (draggedId === targetId) return;
    setVisibleColumns((current) => {
      const active = current[entity];
      if (!active.includes(draggedId) || !active.includes(targetId)) return current;
      const withoutDragged = active.filter((id) => id !== draggedId);
      const targetIndex = withoutDragged.indexOf(targetId);
      const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
      const next = [...withoutDragged.slice(0, insertIndex), draggedId, ...withoutDragged.slice(insertIndex)];
      return { ...current, [entity]: next };
    });
  }

  function updatePropertyDropTarget(event: React.DragEvent<HTMLElement>, fieldId: string) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setPropertyDropTarget({ id: fieldId, position });
  }

  function resetFilters() {
    setFilterDraft(emptyFilter);
    setFilter(emptyFilter);
    setTimeWindow(fullTimeWindow);
    setGlobalSearch("");
    setSearchField("group_id");
    setSorting([]);
    setAdmixtureRunId(null);
    setPage(1);
  }

  function resetCurrentView() {
    if (!schema) return;
    setFilterDraft(emptyFilter);
    setFilter(emptyFilter);
    setSorting([]);
    setVisibleColumns({ sample: schema.defaults.sample, group: schema.defaults.group });
    setColumnWidths({ sample: {}, group: {} });
    setGlobalSearch("");
    setSearchField("group_id");
    setTimeWindow(fullTimeWindow);
    setTimeMode("calendar");
    setAdmixtureRunId(null);
    setPageSize(100);
    setMapBaseStyle("light");
    setMapColorMode("fixed");
    setMapColorBy("sex");
    setMapGradientBy("snp_1240k");
    setMapPresentation("sample_cloud");
    setMapShowGroupCounts(true);
    setMapShowOutlierLinks(false);
    setMapShowCentroids(true);
    setMapShowLegend(true);
    setMapProjectionMode("flat");
    setPage(1);
  }

  const shownFields = activeFields;
  const hiddenFields = allFields.filter((field) => !visibleColumns[entity]?.includes(field.id));
  const sortableFields = allFields.filter((field) => field.sortable !== false);
  const isSearchExpanded = globalSearch.trim().length > 0;
  const headerTotal = viewMode === "map" ? mapTotal : total;
  const mapIssueCount = viewMode === "map" ? (mapReview?.unmappedSamples.total ?? 0) + (mapReview?.coordinateIssues.total ?? 0) : 0;
  const mapIssueBadge = mapIssueCount > 999 ? "999+" : formatCount(mapIssueCount);

  useEffect(() => {
    if (viewMode !== "map" || mapIssueCount === 0) setMapIssuePopoverOpen(false);
  }, [viewMode, mapIssueCount]);

  const handleMapSummaryChange = useCallback((summary: MapQueryResponse["summary"], release: MapQueryResponse["release"]) => {
    setMapTotal(summary.totalMatched);
    setReleaseName(release.name);
  }, []);

  const handleMapReviewChange = useCallback((review: MapReviewData) => {
    setMapReview(review);
  }, []);

  function updateSortRule(index: number, nextRule: SortingState[number]) {
    setSorting((current) => current.map((entry, entryIndex) => (entryIndex === index ? nextRule : entry)));
    setPage(1);
  }

  function removeSortRule(index: number) {
    setSorting((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setPage(1);
  }

  function addSortRule() {
    const firstAvailable = sortableFields.find((field) => !sorting.some((entry) => entry.id === field.id)) ?? sortableFields[0];
    if (!firstAvailable) return;
    setSorting((current) => [...current, { id: firstAvailable.id, desc: false }]);
    setPage(1);
  }

  function updateSortDropTarget(event: React.DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setSortDropTarget({ index, position });
  }

  function reorderSortRule(fromIndex: number, targetIndex: number, position: "before" | "after") {
    if (fromIndex === targetIndex) return;
    setSorting((current) => {
      const item = current[fromIndex];
      if (!item) return current;
      const withoutItem = current.filter((_, index) => index !== fromIndex);
      const adjustedTarget = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const insertIndex = position === "after" ? adjustedTarget + 1 : adjustedTarget;
      return [...withoutItem.slice(0, insertIndex), item, ...withoutItem.slice(insertIndex)];
    });
    setPage(1);
  }

  function saveCurrentProfile(profilesFile = profiles) {
    const current = buildCurrentProfileView(activeProfileName);
    const views = profilesFile.views.some((view) => view.name === activeProfileName)
      ? profilesFile.views.map((view) => (view.name === activeProfileName ? current : view))
      : [...profilesFile.views, current];
    return { version: 1 as const, activeView: activeProfileName, views };
  }

  function switchProfile(name: string) {
    const savedProfiles = saveCurrentProfile();
    const target = savedProfiles.views.find((view) => view.name === name);
    if (!target) return;
    setProfiles(savedProfiles);
    applyProfileView(target);
  }

  function profileNameFromPrompt(message: string, fallback: string) {
    const name = window.prompt(message, fallback)?.trim();
    if (!name) return null;
    if (profiles.views.some((view) => view.name === name && view.name !== activeProfileName)) {
      window.alert(`A profile named "${name}" already exists.`);
      return null;
    }
    return name;
  }

  function createProfile() {
    if (!schema) return;
    const name = profileNameFromPrompt("New profile name", "Untitled View");
    if (!name) return;
    const view: ProfileView = {
      ...buildCurrentProfileView(name),
      filters: emptyFilter,
      sort: [],
      search: { query: "", field: "group_id" },
      timeWindow: fullTimeWindow,
      order: { sample: schema.defaults.sample, group: schema.defaults.group },
      columnSize: { sample: {}, group: {} }
    };
    setProfiles((current) => ({ version: 1, activeView: name, views: [...saveCurrentProfile(current).views, view] }));
    applyProfileView(view);
  }

  function duplicateProfile() {
    const name = profileNameFromPrompt("Duplicate profile as", `${activeProfileName} Copy`);
    if (!name) return;
    const view = { ...buildCurrentProfileView(name), name };
    setProfiles((current) => ({ version: 1, activeView: name, views: [...saveCurrentProfile(current).views, view] }));
    applyProfileView(view);
  }

  function renameProfile() {
    const name = profileNameFromPrompt("Rename profile", activeProfileName);
    if (!name || name === activeProfileName) return;
    const currentView = buildCurrentProfileView(name);
    setProfiles((current) => ({
      version: 1,
      activeView: name,
      views: saveCurrentProfile(current).views.map((view) => (view.name === activeProfileName ? currentView : view))
    }));
    setActiveProfileName(name);
  }

  async function importProfiles(file: File | null | undefined) {
    if (!file || !schema) return;
    try {
      const text = await file.text();
      const imported = parseProfileText(text, schema);
      setProfiles(imported);
      const active = imported.views.find((view) => view.name === imported.activeView) ?? imported.views[0];
      if (active) applyProfileView(active);
    } catch (profileError) {
      window.alert(profileError instanceof Error ? profileError.message : "Profile import failed.");
    } finally {
      if (profileImportRef.current) profileImportRef.current.value = "";
    }
  }

  function exportProfiles() {
    const nextProfiles = saveCurrentProfile();
    const blob = new Blob([stringifyProfileFile(nextProfiles)], { type: "application/yaml;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeProfileName.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}${PROFILE_FILE_EXTENSION}`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function exportCurrentTableCsv() {
    const exportFields = [...activeFields];
    const includeAdmixture = admixtureRunId !== null;
    const headers = [...exportFields.map((field) => field.label), ...(includeAdmixture ? ["ADMIXTURE"] : [])];
    const sort = sortingToSortSpecs(sorting);
    const exportFilter = combineWithTimeWindow(filter, timeWindow);
    const exportedRows: Record<string, unknown>[] = [];
    setCsvExporting(true);
    try {
      for (let exportPage = 1; ; exportPage += 1) {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity,
            view: "table",
            filter: exportFilter,
            globalSearch,
            searchField,
            sort,
            page: exportPage,
            pageSize: CSV_EXPORT_PAGE_SIZE,
            admixtureRunId,
            mapBounds: null
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "CSV export failed");
        const nextRows = normalizeRows(data.rows ?? [], entity);
        exportedRows.push(...nextRows);
        const nextTotal = Number(data.total ?? exportedRows.length);
        if (!nextRows.length || exportedRows.length >= nextTotal) break;
      }
    } catch (exportError) {
      window.alert(exportError instanceof Error ? exportError.message : "CSV export failed.");
      return;
    } finally {
      setCsvExporting(false);
    }

    const lines = [
      headers.map(csvValue).join(","),
      ...exportedRows.map((row) => [
        ...exportFields.map((field) => csvValue(row[field.id])),
        ...(includeAdmixture ? [csvValue(row.admixture)] : [])
      ].join(","))
    ];
    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `archaebase_${entity}_table_${date}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function startPanelResize(event: React.PointerEvent) {
    event.preventDefault();
    panelResizeRef.current = { startX: event.clientX, startWidth: panelWidth };
    const onPointerMove = (moveEvent: PointerEvent) => {
      const active = panelResizeRef.current;
      if (!active) return;
      setPanelWidth(clampPanelWidth(active.startWidth + moveEvent.clientX - active.startX));
    };
    const onPointerUp = () => {
      panelResizeRef.current = null;
      document.body.classList.remove("is-resizing-panel");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.body.classList.add("is-resizing-panel");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  const mapFullViewActive = viewMode === "map" && mapFullView;

  function renderSearchControl(extraClass = "") {
    return (
      <div className={`toolbar-section search-control ${extraClass}`.trim()}>
        <Search size={15} />
        <input
          className="input"
          value={globalSearch}
          placeholder="Search or /regex/"
          onChange={(event) => {
            setGlobalSearch(event.target.value);
            setPage(1);
          }}
        />
        {globalSearch ? (
          <button
            className="search-clear"
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setGlobalSearch("");
              setPage(1);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
        <select
          className="search-field-select"
          value={searchField}
          onChange={(event) => {
            setSearchField(event.target.value);
            setPage(1);
          }}
          aria-label="Search field"
        >
          <option value="group_id">Group ID</option>
          <option value="all">All Fields</option>
          {schema?.sampleFields.map((field) => (
            field.id === "group_id" ? null : (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            )
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={`app-shell ${mapFullViewActive ? "map-full-view" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="brand-title">ArchaeoBase</span>
            <span className="brand-meta">{releaseName ?? "AADR"}</span>
          </div>
          <div className="segmented topbar-segmented view-segmented" aria-label="View">
            <button
              type="button"
              className={viewMode === "table" ? "active" : ""}
              onClick={() => {
                setViewMode("table");
                setPage(1);
              }}
            >
              <Table2 size={14} />
              Table
            </button>
            <button
              type="button"
              className={viewMode === "map" ? "active" : ""}
              onClick={() => {
                setViewMode("map");
                setPage(1);
              }}
            >
              <MapIcon size={14} />
              Map
            </button>
          </div>
          {viewMode === "map" ? (
            <div className="segmented topbar-segmented" aria-label="Marker level">
              <button
                type="button"
                className={mapPresentation === "group_locations" ? "active" : ""}
                onClick={() => setMapPresentation("group_locations")}
                title="Show group-level markers"
              >
                Groups
              </button>
              <button
                type="button"
                className={mapPresentation === "sample_cloud" ? "active" : ""}
                onClick={() => setMapPresentation("sample_cloud")}
                title="Show sample-level markers"
              >
                Samples
              </button>
            </div>
          ) : (
            <div className="segmented topbar-segmented" aria-label="Granularity">
              <button
                type="button"
                className={entity === "sample" ? "active" : ""}
                onClick={() => {
                  setEntity("sample");
                  setSorting([]);
                  setPage(1);
                }}
              >
                Samples
              </button>
              <button
                type="button"
                className={entity === "group" ? "active" : ""}
                onClick={() => {
                  setEntity("group");
                  setSorting([]);
                  setPage(1);
                }}
              >
                Groups
              </button>
            </div>
          )}
        </div>
        <div className="topbar-meta">
          {mapIssueCount > 0 ? (
            <div className="map-issue-control">
              <button
                className={`map-issue-button ${mapIssuePopoverOpen ? "active" : ""}`}
                type="button"
                onClick={() => setMapIssuePopoverOpen((current) => !current)}
                aria-expanded={mapIssuePopoverOpen}
                aria-label={`${mapIssueBadge} map data issues`}
                title="Map data issues"
              >
                <AlertCircle size={15} />
                <span className="map-issue-badge">{mapIssueBadge}</span>
              </button>
              {mapIssuePopoverOpen ? (
                <div className="map-issue-menu" role="dialog" aria-label="Map data issues">
                  {mapReview?.unmappedSamples.total ? (
                    <section>
                      <div className="map-issue-menu-header">
                        <strong>Unmapped Samples</strong>
                        <span>{formatCount(mapReview.unmappedSamples.total)}</span>
                      </div>
                      <p>{formatCount(mapReview.unmappedSamples.total)} matched samples lack coordinates.</p>
                      {mapReview.unmappedSamples.samples.length ? (
                        <ul>
                          {mapReview.unmappedSamples.samples.map((sample) => (
                            <li key={`unmapped:${sample.geneticId}:${sample.groupId}:${sample.locality}`}>
                              <b>{sample.geneticId || sample.groupId || "Sample"}</b>
                              <small>{sample.locality || sample.politicalEntity || "Unknown"}</small>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}
                  {mapReview?.coordinateIssues.total ? (
                    <section>
                      <div className="map-issue-menu-header">
                        <strong>Coordinate Review</strong>
                        <span>{formatCount(mapReview.coordinateIssues.total)}</span>
                      </div>
                      <p>{formatCount(mapReview.coordinateIssues.total)} visible samples have suspicious coordinates.</p>
                      <ul>
                        {mapReview.coordinateIssues.samples.map((sample) => (
                          <li key={`issue:${sample.geneticId}:${sample.latitude}:${sample.longitude}`}>
                            <b>{sample.geneticId || sample.groupId || "Sample"}</b>
                            <small>{sample.reason}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <span>{formatCount(headerTotal)} rows</span>
          <button className="button" type="button" onClick={resetFilters}>
            <RefreshCw size={15} />
            Reset
          </button>
        </div>
      </header>

      <div className={`toolbar ${isSearchExpanded ? "search-expanded" : ""}`}>
        <button
          className={`button icon-label toolbar-action ${panelMode === "settings" ? "active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "settings" ? null : "settings"))}
          aria-expanded={panelMode === "settings"}
          title="Settings"
        >
          <Settings2 size={15} />
          <span className="toolbar-label">Settings</span>
        </button>

        <TimeWindow
          value={timeWindow}
          periodOptions={periodOptions}
          mode={timeMode}
          open={timePanelOpen}
          onOpenChange={setTimePanelOpen}
          onModeChange={setTimeMode}
          onChange={(next) => {
            setTimeWindow(next);
            setPage(1);
          }}
        />

        <button
          className={`button icon-label toolbar-action ${panelMode === "filters" ? "active" : ""} ${appliedFilterCount ? "state-active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "filters" ? null : "filters"))}
          aria-expanded={panelMode === "filters"}
          title="Filters"
        >
          <Filter size={15} />
          <span className="toolbar-label">Filters{appliedFilterCount ? ` ${appliedFilterCount}` : ""}</span>
        </button>

        <button
          className={`button icon-label toolbar-action ${panelMode === "sort" ? "active" : ""} ${sorting.length ? "state-active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "sort" ? null : "sort"))}
          aria-expanded={panelMode === "sort"}
          title="Sort"
        >
          <ArrowUpDown size={15} />
          <span className="toolbar-label">Sort{sorting.length ? ` ${sorting.length}` : ""}</span>
        </button>

        {renderSearchControl()}

        <button
          className={`button icon-label toolbar-action ${panelMode === "columns" ? "active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "columns" ? null : "columns"))}
          aria-expanded={panelMode === "columns"}
          title="Properties"
        >
          <Columns3 size={15} />
          <span className="toolbar-label">Properties</span>
        </button>

        <select
          className="select admixture-select"
          value={admixtureRunId ?? ""}
          onChange={(event) => setAdmixtureRunId(event.target.value ? Number(event.target.value) : null)}
          disabled={!runs.length}
          aria-label="ADMIXTURE run"
        >
          <option value="">ADMIXTURE</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.name} K={run.k}
            </option>
          ))}
        </select>

      </div>

      {mapFullViewActive ? (
        <div className="map-full-controls">
          {renderSearchControl("map-full-search")}
          <TimeWindow
            value={timeWindow}
            periodOptions={periodOptions}
            mode={timeMode}
            open={timePanelOpen}
            onOpenChange={setTimePanelOpen}
            onModeChange={setTimeMode}
            onChange={(next) => {
              setTimeWindow(next);
              setPage(1);
            }}
          />
        </div>
      ) : null}

      {timePanelOpen ? (
        mapFullViewActive ? (
          <div className="map-full-time-panel">
            <TimeWindowPanel
              value={timeWindow}
              periodOptions={periodOptions}
              mode={timeMode}
              onModeChange={setTimeMode}
              onChange={(next) => {
                setTimeWindow(next);
                setPage(1);
              }}
            />
          </div>
        ) : (
          <TimeWindowPanel
            value={timeWindow}
            periodOptions={periodOptions}
            mode={timeMode}
            onModeChange={setTimeMode}
            onChange={(next) => {
              setTimeWindow(next);
              setPage(1);
            }}
          />
        )
      ) : null}

      <div className="content">
        <aside className={`side-panel ${panelMode ? "open" : ""}`} style={panelMode ? { width: panelWidth } : undefined} aria-hidden={!panelMode}>
          {panelMode ? <div className="side-panel-resizer" onPointerDown={startPanelResize} role="separator" aria-orientation="vertical" title="Resize panel" /> : null}
          <div className="panel-header">
            <span>{panelMode === "columns" ? "Properties" : panelMode === "sort" ? "Sort" : panelMode === "settings" ? "Settings" : "Filters"}</span>
            <button className="icon-button" type="button" onClick={() => setPanelMode(null)} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          {panelMode === "filters" ? (
            <section>
              {schema ? (
                <>
                  <FilterBuilder
                    value={filterDraft}
                    fields={schema.filterableFields}
                    operatorsByKind={schema.operatorsByKind}
                    onChange={setFilterDraft}
                  />
                  <div className="panel-footer">
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => {
                        setFilter(filterDraft);
                        setPage(1);
                        setPanelMode(null);
                      }}
                    >
                      Apply filters
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => {
                        setFilterDraft(emptyFilter);
                        setFilter(emptyFilter);
                        setPage(1);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {panelMode === "sort" ? (
            <section>
              <div className="sort-list">
                {sorting.length ? (
                  sorting.map((rule, index) => {
                    const field = sortableFields.find((candidate) => candidate.id === rule.id);
                    const labels = sortDirectionLabels(field);
                    return (
                    <div
                      className={[
                        "sort-row",
                        draggedSortIndex === index ? "dragging" : "",
                        sortDropTarget?.index === index ? `drop-${sortDropTarget.position}` : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={`${rule.id}-${index}`}
                      draggable
                      onDragStart={(event) => {
                        setDraggedSortIndex(index);
                        setSortDropTarget(null);
                        event.dataTransfer.setData("text/plain", String(index));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => updateSortDropTarget(event, index)}
                      onDragEnter={(event) => updateSortDropTarget(event, index)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const draggedIndex = Number(event.dataTransfer.getData("text/plain"));
                        const position = sortDropTarget?.index === index ? sortDropTarget.position : "before";
                        if (Number.isInteger(draggedIndex)) reorderSortRule(draggedIndex, index, position);
                        setDraggedSortIndex(null);
                        setSortDropTarget(null);
                      }}
                      onDragEnd={() => {
                        setDraggedSortIndex(null);
                        setSortDropTarget(null);
                      }}
                    >
                      <span className="drag-handle" title="Drag sort priority">
                        <GripVertical size={14} />
                      </span>
                      <select
                        className="select"
                        value={rule.id}
                        onChange={(event) => updateSortRule(index, { ...rule, id: event.target.value })}
                      >
                        {sortableFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select sort-direction-select"
                        value={rule.desc ? "desc" : "asc"}
                        onChange={(event) => updateSortRule(index, { ...rule, desc: event.target.value === "desc" })}
                      >
                        <option value="asc">{labels.asc}</option>
                        <option value="desc">{labels.desc}</option>
                      </select>
                      <button className="icon-button" type="button" onClick={() => removeSortRule(index)} aria-label="Remove sort">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );})
                ) : (
                  <p className="panel-empty">No sort rules. Table headers can also sort columns.</p>
                )}
              </div>
              <div className="panel-footer">
                <button className="button primary" type="button" onClick={addSortRule} disabled={!sortableFields.length || sorting.length >= MAX_SORT_RULES}>
                  <Plus size={15} />
                  Add sort
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setSorting([]);
                    setPage(1);
                  }}
                  disabled={!sorting.length}
                >
                  Clear
                </button>
              </div>
            </section>
          ) : null}

          {panelMode === "settings" ? (
            <section>
              <div className="settings-stack">
                <div className="settings-block">
                  <span className="settings-title">Views</span>
                  <label className="settings-row">
                    <span>View</span>
                    <select className="select profile-select-panel" value={activeProfileName} onChange={(event) => switchProfile(event.target.value)}>
                      {profiles.views.map((view) => (
                        <option key={view.name} value={view.name}>
                          {view.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings-button-grid">
                    <button className="button" type="button" onClick={createProfile}>
                      <Plus size={14} />
                      New
                    </button>
                    <button className="button" type="button" onClick={duplicateProfile}>
                      <Copy size={14} />
                      Duplicate
                    </button>
                    <button className="button" type="button" onClick={renameProfile}>
                      <Edit3 size={14} />
                      Rename
                    </button>
                    <button className="button" type="button" onClick={() => profileImportRef.current?.click()}>
                      <Upload size={14} />
                      Import
                    </button>
                    <button className="button" type="button" onClick={exportProfiles}>
                      <Download size={14} />
                      Export
                    </button>
                    <button className="button" type="button" onClick={resetCurrentView}>
                      <RefreshCw size={14} />
                      Reset View
                    </button>
                  </div>
                  <input
                    ref={profileImportRef}
                    className="visually-hidden"
                    type="file"
                    accept={`${PROFILE_FILE_EXTENSION},.yml,.yaml`}
                    onChange={(event) => void importProfiles(event.target.files?.[0])}
                  />
                </div>

                {viewMode === "table" ? (
                  <div className="settings-block">
                    <span className="settings-title">Table</span>
                    <label className="settings-row">
                      <span>Page Size</span>
                      <select
                        className="select"
                        value={pageSize}
                        onChange={(event) => {
                          setPageSize(Number(event.target.value));
                          setPage(1);
                        }}
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                      </select>
                    </label>
                    <button className="button settings-wide-button" type="button" onClick={() => void exportCurrentTableCsv()} disabled={csvExporting}>
                      <Download size={14} />
                      {csvExporting ? "Exporting all rows" : "Export all rows CSV"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="settings-block">
                      <span className="settings-title">Marker Styling</span>
                      <div className="settings-row">
                        <span>Color scale</span>
                        <div className="settings-segmented compact">
                          <button
                            className={mapColorMode === "fixed" ? "active" : ""}
                            type="button"
                            onClick={() => setMapColorMode("fixed")}
                          >
                            Categorical
                          </button>
                          <button
                            className={mapColorMode === "gradient" ? "active" : ""}
                            type="button"
                            onClick={() => setMapColorMode("gradient")}
                          >
                            Gradient
                          </button>
                        </div>
                      </div>
                      {mapColorMode === "fixed" ? (
                        <label className="settings-row">
                          <span>Field</span>
                          <select className="select" value={mapColorBy} onChange={(event) => setMapColorBy(event.target.value as MapColorBy)}>
                            {mapFixedColorOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label className="settings-row">
                          <span>Field</span>
                          <select className="select" value={mapGradientBy} onChange={(event) => setMapGradientBy(event.target.value as MapGradientBy)}>
                            {mapGradientOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="settings-block">
                      <span className="settings-title">Display</span>
                      <label className={`settings-row ${mapPresentation !== "group_locations" ? "disabled" : ""}`}>
                        <span>Group count labels</span>
                        <input
                          type="checkbox"
                          checked={mapShowGroupCounts}
                          disabled={mapPresentation !== "group_locations"}
                          onChange={(event) => setMapShowGroupCounts(event.target.checked)}
                        />
                      </label>
                      <label className="settings-row">
                        <span>Show outlier links</span>
                        <input type="checkbox" checked={mapShowOutlierLinks} onChange={(event) => setMapShowOutlierLinks(event.target.checked)} />
                      </label>
                      <label className="settings-row">
                        <span>Show centroids</span>
                        <input type="checkbox" checked={mapShowCentroids} onChange={(event) => setMapShowCentroids(event.target.checked)} />
                      </label>
                      <label className="settings-row">
                        <span>Legend</span>
                        <input type="checkbox" checked={mapShowLegend} onChange={(event) => setMapShowLegend(event.target.checked)} />
                      </label>
                      <label className={`settings-row ${!mapShowLegend ? "disabled" : ""}`}>
                        <span>Fade legend</span>
                        <input
                          type="checkbox"
                          checked={mapFadeLegend}
                          disabled={!mapShowLegend}
                          onChange={(event) => setMapFadeLegend(event.target.checked)}
                        />
                      </label>
                    </div>
                    <div className="settings-block">
                      <span className="settings-title">Map Geometry</span>
                      <div className="settings-row">
                        <span>Projection</span>
                        <div className="settings-segmented compact">
                          <button
                            className={mapProjectionMode === "flat" ? "active" : ""}
                            type="button"
                            onClick={() => setMapProjectionMode("flat")}
                          >
                            Flat
                          </button>
                          <button
                            className={mapProjectionMode === "globe" ? "active" : ""}
                            type="button"
                            onClick={() => setMapProjectionMode("globe")}
                          >
                            Globe
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="settings-block">
                  <span className="settings-title">Period Boundaries</span>
                  <TimePeriodSettings periodOptions={periodOptions} onChange={setPeriodOptions} />
                </div>
              </div>
            </section>
          ) : null}

          {panelMode === "columns" ? (
            <section>
              <div className="column-list">
                {shownFields.map((field) => (
                  <label
                    className={[
                      "column-row draggable",
                      draggedProperty === field.id ? "dragging" : "",
                      propertyDropTarget?.id === field.id ? `drop-${propertyDropTarget.position}` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={field.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggedProperty(field.id);
                      setPropertyDropTarget(null);
                      event.dataTransfer.setData("text/plain", field.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => updatePropertyDropTarget(event, field.id)}
                    onDragEnter={(event) => updatePropertyDropTarget(event, field.id)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedId = event.dataTransfer.getData("text/plain") || draggedProperty;
                      const position = propertyDropTarget?.id === field.id ? propertyDropTarget.position : "before";
                      if (draggedId) reorderVisibleColumn(draggedId, field.id, position);
                      setDraggedProperty(null);
                      setPropertyDropTarget(null);
                    }}
                    onDragEnd={() => {
                      setDraggedProperty(null);
                      setPropertyDropTarget(null);
                    }}
                  >
                    <span className="drag-handle" title="Drag property">
                      <GripVertical size={14} />
                    </span>
                    <input type="checkbox" checked onChange={() => toggleColumn(field.id)} />
                    <span>{field.label}</span>
                  </label>
                ))}
                {hiddenFields.length ? <div className="property-divider" /> : null}
                {hiddenFields.map((field) => (
                  <label className="column-row" key={field.id}>
                    <span className="drag-handle muted">
                      <GripVertical size={14} />
                    </span>
                    <input type="checkbox" checked={false} onChange={() => toggleColumn(field.id)} />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <main className="main">
          {error ? (
            <div className="status">
              <strong>Database setup needed.</strong>
              <p>{error}</p>
              <p className="mono">docker compose up -d</p>
              <p className="mono">cp .env.example .env</p>
              <p className="mono">npm run db:migrate</p>
              <p className="mono">npm run import:aadr -- --file v66.2M.aadr.PUB.anno --release v66.2M.aadr.PUB --replace</p>
            </div>
          ) : (
            <div className={`result-window ${viewMode === "map" ? "map-mode" : "table-mode"}`}>
              {viewMode === "table" ? (
                <DataTable
                  rows={displayedRows}
                  fields={activeFields}
                  visibleColumns={visibleColumns[entity] ?? []}
                  sorting={sorting}
                  onSortingChange={(next) => {
                    setSorting(next);
                    setPage(1);
                  }}
                  onColumnOrderChange={reorderVisibleColumn}
                  columnWidths={columnWidths[entity] ?? {}}
                  onColumnWidthsChange={(next) => setColumnWidths((current) => ({ ...current, [entity]: next }))}
                  showAdmixture={admixtureRunId !== null}
                />
              ) : (
                <MapView
                  filter={queryFilter}
                  globalSearch={debouncedSearch}
                  searchField={searchField}
                  baseStyle={mapBaseStyle}
                  onBaseStyleChange={setMapBaseStyle}
                  colorMode={mapColorMode}
                  colorBy={mapColorBy}
                  gradientBy={mapGradientBy}
                  presentation={mapPresentation}
                  combineNearbyGroups={false}
                  showGroupCounts={mapShowGroupCounts}
                  showOutlierLinks={mapShowOutlierLinks}
                  showCentroids={mapShowCentroids}
                  showLegend={mapShowLegend}
                  fadeLegend={mapFadeLegend}
                  fullView={viewMode === "map" && mapFullView}
                  onFullViewChange={setMapFullView}
                  projectionMode={mapProjectionMode}
                  onProjectionModeChange={setMapProjectionMode}
                  onSummaryChange={handleMapSummaryChange}
                  onReviewChange={handleMapReviewChange}
                />
              )}
            </div>
          )}

          {viewMode === "table" ? (
          <div className="floating-pagination" suppressHydrationWarning>
            <span>
              Page {formatCount(page)} / {formatCount(pages)}
              {loading ? " - loading" : ""}
            </span>
            <select className="select compact-select" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
            <button className="button" type="button" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </button>
            <button className="button" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Prev
            </button>
            <button className="button" type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>
              Next
            </button>
            <button className="button" type="button" disabled={page >= pages} onClick={() => setPage(pages)}>
              Last
            </button>
          </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
