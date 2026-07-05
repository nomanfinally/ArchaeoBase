import { filterableSampleFields, operatorsByKind, sampleFieldById, type FieldDefinition } from "@/lib/schema/fields";
import type { FilterCondition, FilterNode, MapBounds, SqlFragment } from "./types";

type CompileState = {
  params: unknown[];
};

const EMPTY_FILTER: SqlFragment = { text: "TRUE", params: [] };

function hasSampleColumn(field: FieldDefinition | undefined): field is FieldDefinition & { sampleColumn: string } {
  return Boolean(field?.filterable && field.sampleColumn);
}

function addParam(state: CompileState, value: unknown) {
  state.params.push(value);
  return `$${state.params.length}`;
}

function coerceNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function compileTextPatternList(column: string, values: string[], state: CompileState, joiner: "AND" | "OR", negateEach: boolean) {
  if (!values.length) return "TRUE";
  const pieces = values.map((item) => {
    const param = addParam(state, `%${item}%`);
    return negateEach ? `${column} NOT ILIKE ${param}` : `${column} ILIKE ${param}`;
  });
  return pieces.length === 1 ? pieces[0] : `(${pieces.join(` ${joiner} `)})`;
}

function compileCondition(condition: FilterCondition, state: CompileState): string {
  const field = sampleFieldById[condition.field];
  if (!field?.filterable || !field.sampleColumn) {
    throw new Error(`Unsupported filter field: ${condition.field}`);
  }

  const allowed = operatorsByKind[field.kind];
  if (!allowed.includes(condition.operator as never)) {
    throw new Error(`Unsupported operator '${condition.operator}' for ${field.id}.`);
  }

  const column = field.sampleColumn;
  const value = condition.value;

  if (condition.operator === "is_empty") return `${column} IS NULL`;
  if (condition.operator === "is_not_empty") return `${column} IS NOT NULL`;

  if (field.kind === "boolean") {
    const param = addParam(state, value === true || value === "true");
    return `${column} = ${param}`;
  }

  if (field.kind === "text" || field.kind === "enum") {
    if (condition.operator === "contains") {
      const param = addParam(state, `%${String(value ?? "")}%`);
      return `${column} ILIKE ${param}`;
    }
    if (condition.operator === "not_contains") {
      const param = addParam(state, `%${String(value ?? "")}%`);
      return `(${column} IS NULL OR ${column} NOT ILIKE ${param})`;
    }
    if (condition.operator === "contains_any") {
      const values = coerceTextArray(value);
      if (!values.length) return "TRUE";
      return compileTextPatternList(column, values, state, "OR", false);
    }
    if (condition.operator === "contains_all") {
      const values = coerceTextArray(value);
      if (!values.length) return "TRUE";
      return compileTextPatternList(column, values, state, "AND", false);
    }
    if (condition.operator === "not_contains_any") {
      const values = coerceTextArray(value);
      if (!values.length) return "TRUE";
      return `(${column} IS NULL OR ${compileTextPatternList(column, values, state, "AND", true)})`;
    }
    if (condition.operator === "not_contains_all") {
      const values = coerceTextArray(value);
      if (!values.length) return "TRUE";
      return `(${column} IS NULL OR ${compileTextPatternList(column, values, state, "OR", true)})`;
    }
    if (condition.operator === "starts_with") {
      const param = addParam(state, `${String(value ?? "")}%`);
      return `${column} ILIKE ${param}`;
    }
    if (condition.operator === "not_starts_with") {
      const param = addParam(state, `${String(value ?? "")}%`);
      return `(${column} IS NULL OR ${column} NOT ILIKE ${param})`;
    }
    if (condition.operator === "ends_with") {
      const param = addParam(state, `%${String(value ?? "")}`);
      return `${column} ILIKE ${param}`;
    }
    if (condition.operator === "not_ends_with") {
      const param = addParam(state, `%${String(value ?? "")}`);
      return `(${column} IS NULL OR ${column} NOT ILIKE ${param})`;
    }
    if (condition.operator === "equals") {
      const param = addParam(state, String(value ?? ""));
      return `${column} = ${param}`;
    }
    if (condition.operator === "not_equals") {
      const param = addParam(state, String(value ?? ""));
      return `(${column} IS NULL OR ${column} <> ${param})`;
    }
    if (condition.operator === "in" || condition.operator === "not_in") {
      const values = coerceTextArray(value);
      if (!values.length) return condition.operator === "in" ? "FALSE" : "TRUE";
      const param = addParam(state, values);
      return condition.operator === "in" ? `${column} = ANY(${param})` : `(${column} IS NULL OR NOT (${column} = ANY(${param})))`;
    }
  }

  const numberValue = coerceNumber(value);
  if (condition.operator === "between") {
    const values = Array.isArray(value) ? value : String(value ?? "").split(",");
    const low = coerceNumber(values[0]);
    const high = coerceNumber(values[1]);
    if (low === null || high === null) return "TRUE";
    const lowParam = addParam(state, low);
    const highParam = addParam(state, high);
    return `${column} BETWEEN ${lowParam} AND ${highParam}`;
  }
  if (numberValue === null) return "TRUE";

  const param = addParam(state, numberValue);
  if (condition.operator === "equals") return `${column} = ${param}`;
  if (condition.operator === "not_equals") return `(${column} IS NULL OR ${column} <> ${param})`;
  if (condition.operator === "gt") return `${column} > ${param}`;
  if (condition.operator === "gte") return `${column} >= ${param}`;
  if (condition.operator === "lt") return `${column} < ${param}`;
  if (condition.operator === "lte") return `${column} <= ${param}`;

  throw new Error(`Unsupported filter condition: ${condition.operator}`);
}

function compileNode(node: FilterNode, state: CompileState, depth: number): string {
  if (depth > 6) {
    throw new Error("Advanced filters support up to 6 nested group levels.");
  }

  if (node.type === "condition") {
    return compileCondition(node, state);
  }

  const children = node.children
    .map((child) => compileNode(child, state, depth + 1))
    .filter((text) => text && text !== "TRUE");

  if (!children.length) return "TRUE";
  if (node.op === "not") {
    return `(NOT (${children.join(" OR ")}))`;
  }

  const joiner = node.op === "or" ? " OR " : " AND ";
  return `(${children.join(joiner)})`;
}

export function compileSampleFilter(filter?: FilterNode | null): SqlFragment {
  if (!filter) return EMPTY_FILTER;
  const state: CompileState = { params: [] };
  return { text: compileNode(filter, state, 1), params: state.params };
}

export function compileGlobalSearch(query: string | undefined, searchField?: string | null): SqlFragment {
  const trimmed = query?.trim();
  if (!trimmed) return EMPTY_FILTER;

  const searchable =
    searchField && searchField !== "all"
      ? [sampleFieldById[searchField]].filter(hasSampleColumn)
      : filterableSampleFields.filter(hasSampleColumn);

  if (!searchable.length) return EMPTY_FILTER;

  const regexMatch = trimmed.match(/^\/(.+)\/$/);
  const regexSearch = trimmed.startsWith("re:") ? trimmed.slice(3).trim() : regexMatch?.[1];
  if (regexSearch) {
    const param = "$1";
    return {
      text: `(${searchable.map((field) => `coalesce(${field.sampleColumn}::text, '') ~* ${param}`).join(" OR ")})`,
      params: [regexSearch]
    };
  }

  const param = "$1";
  return {
    text: `(${searchable.map((field) => `coalesce(${field.sampleColumn}::text, '') ILIKE ${param}`).join(" OR ")})`,
    params: [`%${trimmed}%`]
  };
}

export function compileMapBounds(bounds: MapBounds | null | undefined): SqlFragment {
  if (!bounds) return EMPTY_FILTER;
  return {
    text: "s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)",
    params: [bounds.west, bounds.south, bounds.east, bounds.north]
  };
}

export function mergeWhere(fragments: SqlFragment[]) {
  const params: unknown[] = [];
  const texts: string[] = [];

  for (const fragment of fragments) {
    if (!fragment.text || fragment.text === "TRUE") continue;
    const offsetText = fragment.text.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + params.length}`);
    texts.push(offsetText);
    params.push(...fragment.params);
  }

  return {
    text: texts.length ? texts.join(" AND ") : "TRUE",
    params
  };
}
