"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { FilterNode } from "@/lib/filters/types";
import type { FieldDefinition, Operator } from "@/lib/schema/fields";

type Props = {
  value: FilterNode;
  fields: FieldDefinition[];
  operatorsByKind: Record<string, Operator[]>;
  onChange: (value: FilterNode) => void;
};

const operatorLabels: Record<string, string> = {
  contains: "contains",
  not_contains: "does not contain",
  contains_any: "contains any of",
  contains_all: "contains all of",
  not_contains_any: "does not contain any of",
  not_contains_all: "does not contain all of",
  starts_with: "starts with",
  not_starts_with: "does not start with",
  ends_with: "ends with",
  not_ends_with: "does not end with",
  equals: "is",
  not_equals: "is not",
  in: "is one of",
  not_in: "is not one of",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  between: "between",
  is_empty: "is empty",
  is_not_empty: "is not empty"
};

const groupLabels = {
  and: "All of the following are true",
  or: "Any of the following are true",
  not: "None of the following are true"
};

function defaultCondition(fields: FieldDefinition[], operatorsByKind: Record<string, Operator[]>): FilterNode {
  const field = fields[0];
  return {
    type: "condition",
    field: field?.id ?? "genetic_id",
    operator: operatorsByKind[field?.kind ?? "text"]?.[0] ?? "contains",
    value: ""
  };
}

function updateChild(group: Extract<FilterNode, { type: "group" }>, index: number, child: FilterNode) {
  return {
    ...group,
    children: group.children.map((existing, childIndex) => (childIndex === index ? child : existing))
  };
}

function removeChild(group: Extract<FilterNode, { type: "group" }>, index: number) {
  return {
    ...group,
    children: group.children.filter((_, childIndex) => childIndex !== index)
  };
}

function uniqueValueOperators(operator: string) {
  return operator === "equals" || operator === "not_equals";
}

function listValueOperators(operator: string) {
  return operator === "in" || operator === "not_in" || operator.endsWith("_any") || operator.endsWith("_all");
}

function UniqueValueInput({
  node,
  field,
  onChange
}: {
  node: Extract<FilterNode, { type: "condition" }>;
  field: FieldDefinition;
  onChange: (next: FilterNode) => void;
}) {
  const [query, setQuery] = useState(String(node.value ?? ""));
  const [values, setValues] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(String(node.value ?? ""));
  }, [node.field, node.operator, node.value]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          field: field.id,
          q: query,
          limit: "50"
        });
        const response = await fetch(`/api/schema/field-values?${params.toString()}`, { signal: controller.signal });
        const data = (await response.json()) as { values?: string[] };
        setValues(Array.from(new Set(data.values ?? [])));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setValues([]);
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [field.id, open, query]);

  function commit(nextValue: string) {
    setQuery(nextValue);
    onChange({ ...node, value: nextValue });
  }

  return (
    <div className="value-search value-input">
      <input
        className="input"
        value={query}
        placeholder="Search unique values"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => commit(event.target.value)}
      />
      {query ? (
        <button className="value-clear" type="button" aria-label="Clear value" onMouseDown={(event) => event.preventDefault()} onClick={() => commit("")}>
          <X size={13} />
        </button>
      ) : null}
      {open ? (
        <div className="value-suggestions">
          {loading ? <div className="value-suggestion muted">Searching...</div> : null}
          {!loading && values.length
            ? values.map((value) => (
                <button key={value} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => commit(value)}>
                  {value}
                </button>
              ))
            : null}
          {!loading && !values.length ? <div className="value-suggestion muted">No unique values</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ValueControl({
  node,
  field,
  onChange
}: {
  node: Extract<FilterNode, { type: "condition" }>;
  field: FieldDefinition | undefined;
  onChange: (next: FilterNode) => void;
}) {
  if (node.operator === "is_empty" || node.operator === "is_not_empty") {
    return <span className="mono value-input">..</span>;
  }

  if (field?.kind === "boolean") {
    return (
      <select
        className="select value-input"
        value={String(node.value ?? "true")}
        onChange={(event) => onChange({ ...node, value: event.target.value === "true" })}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (field && uniqueValueOperators(node.operator)) {
    return <UniqueValueInput node={node} field={field} onChange={onChange} />;
  }

  return (
    <input
      className="input value-input"
      value={String(node.value ?? "")}
      placeholder={node.operator === "between" ? "min,max" : listValueOperators(node.operator) ? "value1, value2" : "value"}
      onChange={(event) => onChange({ ...node, value: event.target.value })}
    />
  );
}

function conjunctionLabel(parentOp: "and" | "or" | "not", index: number) {
  if (index === 0) return "where";
  if (parentOp === "or" || parentOp === "not") return "or";
  return "and";
}

function FilterNodeEditor({
  node,
  fields,
  operatorsByKind,
  depth,
  relationLabel,
  onChange,
  onRemove
}: {
  node: FilterNode;
  fields: FieldDefinition[];
  operatorsByKind: Record<string, Operator[]>;
  depth: number;
  relationLabel?: string;
  onChange: (value: FilterNode) => void;
  onRemove?: () => void;
}) {
  if (node.type === "condition") {
    const field = fields.find((candidate) => candidate.id === node.field) ?? fields[0];
    const operators = operatorsByKind[field?.kind ?? "text"] ?? ["contains"];

    return (
      <div className="filter-row">
        <span className="filter-relation">{relationLabel ?? "where"}</span>
        <select
          className="select field-select"
          value={node.field}
          onChange={(event) => {
            const nextField = fields.find((candidate) => candidate.id === event.target.value) ?? fields[0];
            onChange({
              ...node,
              field: event.target.value,
              operator: operatorsByKind[nextField?.kind ?? "text"]?.[0] ?? "contains",
              value: ""
            });
          }}
        >
          {fields.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
        <select
          className="select operator-select"
          value={node.operator}
          onChange={(event) => onChange({ ...node, operator: event.target.value, value: "" })}
        >
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {operatorLabels[operator] ?? operator}
            </option>
          ))}
        </select>
        <ValueControl node={node} field={field} onChange={onChange} />
        {onRemove ? (
          <button className="button danger" type="button" onClick={onRemove} title="Remove filter">
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="filter-group">
      <div className="filter-group-header">
        <select className="select" value={node.op} onChange={(event) => onChange({ ...node, op: event.target.value as "and" | "or" | "not" })}>
          <option value="and">{groupLabels.and}</option>
          <option value="or">{groupLabels.or}</option>
          <option value="not">{groupLabels.not}</option>
        </select>
        {onRemove ? (
          <button className="icon-button danger" type="button" onClick={onRemove} title="Remove group" aria-label="Remove group">
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      {node.children.map((child, index) => (
        <FilterNodeEditor
          key={index}
          node={child}
          fields={fields}
          operatorsByKind={operatorsByKind}
          depth={depth + 1}
          relationLabel={conjunctionLabel(node.op, index)}
          onChange={(next) => onChange(updateChild(node, index, next))}
          onRemove={() => onChange(removeChild(node, index))}
        />
      ))}
      <div className="filter-actions">
        <button className="button" type="button" onClick={() => onChange({ ...node, children: [...node.children, defaultCondition(fields, operatorsByKind)] })}>
          <Plus size={14} />
          Add filter
        </button>
        {depth < 5 ? (
          <button
            className="button"
            type="button"
            onClick={() =>
              onChange({
                ...node,
                children: [...node.children, { type: "group", op: "and", children: [defaultCondition(fields, operatorsByKind)] }]
              })
            }
          >
            <Plus size={14} />
            Add filter group
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterBuilder({ value, fields, operatorsByKind, onChange }: Props) {
  return <FilterNodeEditor node={value} fields={fields} operatorsByKind={operatorsByKind} depth={1} onChange={onChange} />;
}
