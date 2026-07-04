"use client";

import { useEffect, useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { ArrowUpDown, Columns3, Filter, GripVertical, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { FilterNode } from "@/lib/filters/types";
import type { FieldDefinition, Operator } from "@/lib/schema/fields";
import { DataTable } from "./DataTable";
import { FilterBuilder } from "./FilterBuilder";
import { fullTimeWindow, isFullTimeWindow, TimeWindow, type TimeWindowValue } from "./TimeWindow";

type Entity = "sample" | "group";
type PanelMode = "filters" | "sort" | "columns" | null;

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

const emptyFilter: FilterNode = {
  type: "group",
  op: "and",
  children: []
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeRows(rows: Record<string, unknown>[], entity: Entity) {
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

function countConditions(node: FilterNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((total, child) => total + countConditions(child), 0);
}

function combineWithTimeWindow(filter: FilterNode, timeWindow: TimeWindowValue): FilterNode {
  if (isFullTimeWindow(timeWindow)) return filter;

  return {
    type: "group",
    op: "and",
    children: [
      filter,
      {
        type: "condition",
        field: "date_mean_year_ce",
        operator: "between",
        value: [timeWindow.startYear, timeWindow.endYear]
      }
    ]
  };
}

export function Explorer() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [entity, setEntity] = useState<Entity>("sample");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [filterDraft, setFilterDraft] = useState<FilterNode>(emptyFilter);
  const [filter, setFilter] = useState<FilterNode>(emptyFilter);
  const [visibleColumns, setVisibleColumns] = useState<Record<Entity, string[]>>({ sample: [], group: [] });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [releaseName, setReleaseName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AdmixtureRun[]>([]);
  const [admixtureRunId, setAdmixtureRunId] = useState<number | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindowValue>(fullTimeWindow);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [draggedProperty, setDraggedProperty] = useState<string | null>(null);
  const [propertyDropTarget, setPropertyDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

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
  const queryFilter = useMemo(() => combineWithTimeWindow(filter, timeWindow), [filter, timeWindow]);

  useEffect(() => {
    if (!schema) return;

    const controller = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            entity,
            view: "table",
            filter: queryFilter,
            globalSearch,
            searchField,
            sort: sorting.map((entry) => ({ field: entry.id, direction: entry.desc ? "desc" : "asc" })),
            page,
            pageSize,
            visibleColumns: visibleColumns[entity],
            admixtureRunId
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Query failed");
        }
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setReleaseName(data.release?.name ?? null);
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
  }, [schema, entity, queryFilter, globalSearch, searchField, sorting, page, pageSize, visibleColumns, admixtureRunId]);

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
    setSearchField("all");
    setSorting([]);
    setAdmixtureRunId(null);
    setPage(1);
  }

  const shownFields = activeFields;
  const hiddenFields = allFields.filter((field) => !visibleColumns[entity]?.includes(field.id));
  const sortableFields = allFields.filter((field) => field.sortable !== false);
  const isSearchExpanded = globalSearch.trim().length > 0;

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="brand-title">ArchaeoBase</span>
            <span className="brand-meta">{releaseName ?? "AADR"}</span>
          </div>
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
        </div>
        <div className="topbar-meta">
          <span>{formatCount(total)} rows</span>
          <button className="button" type="button" onClick={resetFilters}>
            <RefreshCw size={15} />
            Reset
          </button>
        </div>
      </header>

      <div className={`toolbar ${isSearchExpanded ? "search-expanded" : ""}`}>
        <button
          className={`button icon-label toolbar-action ${panelMode === "filters" ? "active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "filters" ? null : "filters"))}
          aria-expanded={panelMode === "filters"}
          title="Filters"
        >
          <Filter size={15} />
          <span className="toolbar-label">Filters{appliedFilterCount ? ` ${appliedFilterCount}` : ""}</span>
        </button>

        <button
          className={`button icon-label toolbar-action ${panelMode === "sort" ? "active" : ""}`}
          type="button"
          onClick={() => setPanelMode((current) => (current === "sort" ? null : "sort"))}
          aria-expanded={panelMode === "sort"}
          title="Sort"
        >
          <ArrowUpDown size={15} />
          <span className="toolbar-label">Sort{sorting.length ? ` ${sorting.length}` : ""}</span>
        </button>

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

        <div className="toolbar-section search-control">
          <Search size={15} />
          <input
            className="input"
            value={globalSearch}
            placeholder="Search"
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
            <option value="all">All Fields</option>
            {schema?.sampleFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </div>

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

        <TimeWindow
          value={timeWindow}
          onChange={(next) => {
            setTimeWindow(next);
            setPage(1);
          }}
        />

      </div>

      <div className="content">
        <aside className={`side-panel ${panelMode ? "open" : ""}`} aria-hidden={!panelMode}>
          <div className="panel-header">
            <span>{panelMode === "columns" ? "Properties" : panelMode === "sort" ? "Sort" : "Filters"}</span>
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
                  sorting.map((rule, index) => (
                    <div className="sort-row" key={`${rule.id}-${index}`}>
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
                        <option value="asc">Asc</option>
                        <option value="desc">Desc</option>
                      </select>
                      <button className="icon-button" type="button" onClick={() => removeSortRule(index)} aria-label="Remove sort">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="panel-empty">No sort rules. Table headers can also sort columns.</p>
                )}
              </div>
              <div className="panel-footer">
                <button className="button primary" type="button" onClick={addSortRule} disabled={!sortableFields.length || sorting.length >= 3}>
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
              columnWidthStorageKey={`archaebase:${entity}:column-widths`}
              showAdmixture={admixtureRunId !== null}
            />
          )}

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
        </main>
      </div>
    </div>
  );
}
