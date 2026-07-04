"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { FieldDefinition } from "@/lib/schema/fields";
import { AdmixtureBar } from "./AdmixtureBar";

type Props = {
  rows: Record<string, unknown>[];
  fields: FieldDefinition[];
  visibleColumns: string[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  onColumnOrderChange: (draggedId: string, targetId: string) => void;
  columnWidthStorageKey: string;
  showAdmixture: boolean;
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "..";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "..";
    if (Math.abs(value) >= 1000) return new Intl.NumberFormat("en-US").format(Math.round(value));
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 92;
const MAX_COLUMN_WIDTH = 520;

function clampColumnWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

export function DataTable({
  rows,
  fields,
  visibleColumns,
  sorting,
  onSortingChange,
  onColumnOrderChange,
  columnWidthStorageKey,
  showAdmixture
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const fieldById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const activeFields = useMemo(
    () => visibleColumns.map((fieldId) => fieldById.get(fieldId)).filter((field): field is FieldDefinition => Boolean(field)),
    [fieldById, visibleColumns]
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(columnWidthStorageKey);
      setColumnWidths(stored ? JSON.parse(stored) : {});
    } catch {
      setColumnWidths({});
    }
  }, [columnWidthStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
    } catch {
      // Local storage is a convenience only; resizing still works without it.
    }
  }, [columnWidths, columnWidthStorageKey]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();

      const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientWidth : 1;
      element.scrollLeft += dominantDelta * multiplier;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function getColumnWidth(columnId: string) {
    return columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTH;
  }

  function startResize(columnId: string, event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      id: columnId,
      startX: event.clientX,
      startWidth: getColumnWidth(columnId)
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      const nextWidth = clampColumnWidth(active.startWidth + moveEvent.clientX - active.startX);
      setColumnWidths((current) => ({ ...current, [active.id]: nextWidth }));
    };

    const onPointerUp = () => {
      resizeRef.current = null;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-column");
    };

    document.body.classList.add("is-resizing-column");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function autoFitColumn(columnId: string) {
    const label = columnId === "admixture" ? "ADMIXTURE" : activeFields.find((field) => field.id === columnId)?.label ?? columnId;
    const sampleValues = rows.slice(0, 150).map((row) => formatValue(row[columnId]));
    const longest = [label, ...sampleValues].reduce((max, value) => Math.max(max, value.length), 0);
    const nextWidth = columnId === "admixture" ? 170 : clampColumnWidth(longest * 7.2 + 42);
    setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
  }

  function columnStyle(columnId: string) {
    const width = getColumnWidth(columnId);
    return { width, flexBasis: width };
  }

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const base = activeFields.map((field) => ({
      id: field.id,
      accessorKey: field.id,
      header: field.label,
      enableSorting: field.sortable !== false,
      cell: ({ getValue }) => {
        const className = field.id.includes("id") || field.id === "group_id" ? "mono" : "";
        return <span className={className}>{formatValue(getValue())}</span>;
      }
    })) satisfies ColumnDef<Record<string, unknown>>[];

    if (showAdmixture) {
      base.push({
        id: "admixture",
        accessorKey: "admixture",
        header: "ADMIXTURE",
        enableSorting: false,
        cell: ({ getValue }) => <AdmixtureBar value={getValue() as Record<string, number> | null} />
      });
    }

    return base;
  }, [activeFields, showAdmixture]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    manualSorting: true,
    onSortingChange: (updater) => {
      onSortingChange(typeof updater === "function" ? updater(sorting) : updater);
    },
    getCoreRowModel: getCoreRowModel()
  });

  const tableRows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 33,
    overscan: 14
  });

  return (
    <div ref={parentRef} className="table-wrap">
      <div className="data-table" style={{ width: Math.max(columns.reduce((sum, column) => sum + getColumnWidth(column.id ?? ""), 0), 980) }}>
        <div className="table-head">
          {table.getHeaderGroups()[0]?.headers.map((header) => {
            const sorted = header.column.getIsSorted();
            const columnId = header.column.id;
            return (
              <div
                className="th"
                key={header.id}
                style={columnStyle(columnId)}
                draggable={columnId !== "admixture"}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", columnId);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (columnId !== "admixture") event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = event.dataTransfer.getData("text/plain");
                  if (draggedId && draggedId !== columnId && columnId !== "admixture") {
                    onColumnOrderChange(draggedId, columnId);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={header.column.getToggleSortingHandler()}
                  disabled={!header.column.getCanSort()}
                  title={header.column.getCanSort() ? "Sort column" : undefined}
                >
                  <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                  {sorted === "asc" ? <ArrowUp size={13} /> : sorted === "desc" ? <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}
                </button>
                <span
                  className="column-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize. Double-click to auto-fit."
                  onPointerDown={(event) => startResize(columnId, event)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    autoFitColumn(columnId);
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="table-body" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = tableRows[virtualRow.index];
            return (
              <div
                className="tr"
                key={row.id}
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div className="td" key={cell.id} title={formatValue(cell.getValue())} style={columnStyle(cell.column.id)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
