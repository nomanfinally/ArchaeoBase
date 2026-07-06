import { parse, stringify } from "yaml";
import type { FilterCondition, FilterNode, SnpAlleleRole, SnpColorSpec, SnpCopyState, SnpFilter, SortDirection, SortSpec } from "@/lib/filters/types";
import type { FieldDefinition, Operator } from "@/lib/schema/fields";
import type { PeriodOption } from "@/lib/periods";

export const PROFILE_VERSION = 1;
export const PROFILE_FILE_EXTENSION = ".archaebase.yml";

export type Entity = "sample" | "group";
export type ViewMode = "table" | "map";

export type ProfileMapSettings = {
  baseStyle?: string;
  colorMode?: string;
  colorBy?: string;
  gradientBy?: string;
  presentation?: string;
  showGroupCounts?: boolean;
  showOutlierLinks?: boolean;
  showCentroids?: boolean;
  showLegend?: boolean;
  fadeLegend?: boolean;
  projectionMode?: string;
  snpPalette?: string;
  includeSnpZeroCopies?: boolean;
};

export type ProfileTimeWindow = {
  startYear: number;
  endYear: number;
  intervals?: { startYear: number; endYear: number; label?: string }[];
};

export type ProfileView = {
  name: string;
  type: ViewMode;
  entity: Entity;
  filters?: FilterNode | null;
  sort?: SortSpec[];
  order?: Partial<Record<Entity, string[]>>;
  columnSize?: Partial<Record<Entity, Record<string, number>>>;
  search?: {
    query?: string;
    field?: string | null;
  };
  timeWindow?: ProfileTimeWindow;
  timeMode?: "calendar" | "bp";
  periods?: PeriodOption[];
  admixtureRunId?: number | null;
  snpFilters?: SnpFilter[];
  snpColor?: SnpColorSpec | null;
  pageSize?: number;
  map?: ProfileMapSettings;
  panel?: {
    rightWidth?: number;
    timeOpen?: boolean;
  };
};

export type ProfileFile = {
  version: typeof PROFILE_VERSION;
  activeView?: string;
  views: ProfileView[];
};

export type ProfileSchema = {
  sampleFields: FieldDefinition[];
  groupFields: FieldDefinition[];
  filterableFields: FieldDefinition[];
  operatorsByKind: Record<string, Operator[]>;
  defaults: {
    sample: string[];
    group: string[];
  };
};

type NormalizeOptions = {
  strict: boolean;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function validEntity(value: unknown): Entity {
  return value === "group" ? "group" : "sample";
}

function validViewMode(value: unknown): ViewMode {
  return value === "map" ? "map" : "table";
}

function fieldMap(fields: FieldDefinition[]) {
  return new Map(fields.map((field) => [field.id, field]));
}

function sanitizeOrder(value: unknown, fields: FieldDefinition[], defaults: string[]) {
  const known = fieldMap(fields);
  if (!Array.isArray(value)) return defaults;
  const next = value.map(String).filter((fieldId, index, list) => known.has(fieldId) && list.indexOf(fieldId) === index);
  return next.length ? next : defaults;
}

function sanitizeColumnSizes(value: unknown, fields: FieldDefinition[]) {
  const known = fieldMap(fields);
  const object = asObject(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object)
      .filter(([fieldId, width]) => known.has(fieldId) && typeof width === "number" && Number.isFinite(width))
      .map(([fieldId, width]) => [fieldId, Math.round(Math.min(520, Math.max(92, width as number)))])
  );
}

function normalizeFilterNode(
  node: unknown,
  schema: ProfileSchema,
  options: NormalizeOptions,
  errors: string[],
  path = "filters",
  depth = 1
): FilterNode | null {
  const object = asObject(node);
  if (!object) {
    if (options.strict && node !== undefined && node !== null) errors.push(`${path} must be a filter object.`);
    return null;
  }
  if (depth > 6) {
    errors.push(`${path} exceeds the maximum nested filter depth of 6.`);
    return null;
  }

  if (object.type === "condition") {
    const fieldId = asString(object.field);
    const field = schema.filterableFields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      errors.push(`${path}.field '${fieldId}' is not filterable.`);
      return null;
    }
    const operator = asString(object.operator);
    const allowed = schema.operatorsByKind[field.kind] ?? [];
    if (!allowed.includes(operator as Operator)) {
      errors.push(`${path}.operator '${operator}' is not valid for ${fieldId}.`);
      return null;
    }
    return {
      type: "condition",
      field: fieldId,
      operator,
      value: (object as FilterCondition).value
    };
  }

  if (object.type === "group") {
    const op = object.op === "or" || object.op === "not" ? object.op : "and";
    const rawChildren = Array.isArray(object.children) ? object.children : [];
    const children = rawChildren
      .map((child, index) => normalizeFilterNode(child, schema, options, errors, `${path}.children[${index}]`, depth + 1))
      .filter((child): child is FilterNode => Boolean(child));
    if (options.strict && rawChildren.length !== children.length) return null;
    return { type: "group", op, children };
  }

  errors.push(`${path}.type must be 'condition' or 'group'.`);
  return null;
}

function normalizeSort(value: unknown, schema: ProfileSchema, entity: Entity, options: NormalizeOptions, errors: string[]) {
  if (!Array.isArray(value)) return [];
  const fields = entity === "sample" ? schema.sampleFields : schema.groupFields;
  const sortable = new Set(fields.filter((field) => field.sortable !== false).map((field) => field.id));
  const next: SortSpec[] = [];
  for (const [index, item] of value.entries()) {
    const object = asObject(item);
    const field = asString(object?.field);
    const direction: SortDirection = object?.direction === "desc" ? "desc" : "asc";
    if (!sortable.has(field) && !/^snp_\d+$/.test(field)) {
      const message = `sort[${index}].field '${field}' is not sortable for ${entity}.`;
      if (options.strict) errors.push(message);
      continue;
    }
    if (!next.some((entry) => entry.field === field)) next.push({ field, direction });
  }
  return next.slice(0, 8);
}

function normalizeSnpAlleleRole(value: unknown): SnpAlleleRole {
  return value === "ref" ? "ref" : "alt";
}

function normalizeSnpCopyStates(value: unknown): SnpCopyState[] {
  if (!Array.isArray(value)) return [];
  const states: SnpCopyState[] = [];
  for (const item of value) {
    const state = item === "missing" ? "missing" : Number(item);
    if (state !== 0 && state !== 1 && state !== 2 && state !== "missing") continue;
    if (!states.includes(state)) states.push(state);
  }
  return states;
}

function normalizeSnpFilters(value: unknown): SnpFilter[] {
  if (!Array.isArray(value)) return [];
  const filters: SnpFilter[] = [];
  for (const item of value) {
    const object = asObject(item);
    const snpId = asString(object?.snpId).trim();
    const copyStates = normalizeSnpCopyStates(object?.copyStates);
    if (!snpId || !copyStates.length) continue;
    filters.push({
      snpId,
      alleleRole: normalizeSnpAlleleRole(object?.alleleRole),
      copyStates
    });
  }
  return filters.slice(0, 12);
}

function normalizeSnpColor(value: unknown): SnpColorSpec | null {
  const object = asObject(value);
  const snpId = asString(object?.snpId).trim();
  if (!snpId) return null;
  return {
    snpId,
    alleleRole: normalizeSnpAlleleRole(object?.alleleRole)
  };
}

function normalizePeriods(value: unknown): PeriodOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const periods = value
    .map((item) => {
      const object = asObject(item);
      const label = asString(object?.label).trim();
      const startYear = asNumber(object?.startYear);
      const endYear = asNumber(object?.endYear);
      if (!label || startYear === null || endYear === null) return null;
      return {
        label,
        startYear: Math.min(startYear, endYear),
        endYear: Math.max(startYear, endYear)
      };
    })
    .filter((period): period is PeriodOption => Boolean(period));
  return periods.length ? periods : undefined;
}

function normalizeTimeWindow(value: unknown): ProfileTimeWindow | undefined {
  const object = asObject(value);
  const startYear = asNumber(object?.startYear);
  const endYear = asNumber(object?.endYear);
  if (startYear === null || endYear === null) return undefined;
  const intervals = Array.isArray(object?.intervals)
    ? object.intervals
        .map((item) => {
          const interval = asObject(item);
          const intervalStart = asNumber(interval?.startYear);
          const intervalEnd = asNumber(interval?.endYear);
          if (intervalStart === null || intervalEnd === null) return null;
          return {
            startYear: Math.min(intervalStart, intervalEnd),
            endYear: Math.max(intervalStart, intervalEnd),
            ...(typeof interval?.label === "string" ? { label: interval.label } : {})
          };
        })
        .filter((interval): interval is { startYear: number; endYear: number; label?: string } => Boolean(interval))
    : undefined;
  return {
    startYear: Math.min(startYear, endYear),
    endYear: Math.max(startYear, endYear),
    ...(intervals?.length ? { intervals } : {})
  };
}

export function normalizeProfileView(raw: unknown, schema: ProfileSchema, options: NormalizeOptions = { strict: true }) {
  const errors: string[] = [];
  const object = asObject(raw);
  if (!object) {
    return { view: null, errors: ["Profile view must be an object."] };
  }

  const entity = validEntity(object.entity);
  const type = validViewMode(object.type);
  const filter = normalizeFilterNode(object.filters ?? object.filter, schema, options, errors);
  const sampleOrder = sanitizeOrder(asObject(object.order)?.sample, schema.sampleFields, schema.defaults.sample);
  const groupOrder = sanitizeOrder(asObject(object.order)?.group, schema.groupFields, schema.defaults.group);
  const columnSizeObject = asObject(object.columnSize);
  const searchObject = asObject(object.search);
  const panelObject = asObject(object.panel);
  const mapObject = asObject(object.map);

  const view: ProfileView = {
    name: asString(object.name, "Imported View").trim() || "Imported View",
    type,
    entity,
    filters: filter ?? { type: "group", op: "and", children: [] },
    sort: normalizeSort(object.sort, schema, entity, options, errors),
    order: { sample: sampleOrder, group: groupOrder },
    columnSize: {
      sample: sanitizeColumnSizes(columnSizeObject?.sample, schema.sampleFields),
      group: sanitizeColumnSizes(columnSizeObject?.group, schema.groupFields)
    },
    search: {
      query: asString(searchObject?.query),
      field: typeof searchObject?.field === "string" || searchObject?.field === null ? searchObject.field : "group_id"
    },
    timeWindow: normalizeTimeWindow(object.timeWindow),
    timeMode: object.timeMode === "bp" ? "bp" : "calendar",
    periods: normalizePeriods(object.periods),
    admixtureRunId: asNumber(object.admixtureRunId),
    snpFilters: normalizeSnpFilters(object.snpFilters),
    snpColor: normalizeSnpColor(object.snpColor),
    pageSize: asNumber(object.pageSize) ?? undefined,
    map: {
      baseStyle: asString(mapObject?.baseStyle, undefined as unknown as string),
      colorMode: asString(mapObject?.colorMode, undefined as unknown as string),
      colorBy: asString(mapObject?.colorBy, undefined as unknown as string),
      gradientBy: asString(mapObject?.gradientBy, undefined as unknown as string),
      presentation: asString(mapObject?.presentation, undefined as unknown as string),
      showGroupCounts: asBoolean(mapObject?.showGroupCounts),
      showOutlierLinks: asBoolean(mapObject?.showOutlierLinks),
      showCentroids: asBoolean(mapObject?.showCentroids),
      showLegend: asBoolean(mapObject?.showLegend),
      fadeLegend: asBoolean(mapObject?.fadeLegend),
      projectionMode: asString(mapObject?.projectionMode, undefined as unknown as string),
      snpPalette: asString(mapObject?.snpPalette, undefined as unknown as string),
      includeSnpZeroCopies: asBoolean(mapObject?.includeSnpZeroCopies)
    },
    panel: {
      rightWidth: asNumber(panelObject?.rightWidth) ?? undefined,
      timeOpen: asBoolean(panelObject?.timeOpen)
    }
  };

  return { view: errors.length && options.strict ? null : view, errors };
}

export function normalizeProfileFile(raw: unknown, schema: ProfileSchema, options: NormalizeOptions = { strict: true }) {
  const object = asObject(raw);
  if (!object) {
    return { profile: null, errors: ["Profile file must be a YAML object."] };
  }
  const rawViews = Array.isArray(object.views) ? object.views : [];
  const errors: string[] = [];
  const views = rawViews
    .map((view, index) => {
      const normalized = normalizeProfileView(view, schema, options);
      errors.push(...normalized.errors.map((error) => `views[${index}].${error}`));
      return normalized.view;
    })
    .filter((view): view is ProfileView => Boolean(view));

  if (!views.length) errors.push("Profile file must contain at least one valid view.");

  const profile: ProfileFile = {
    version: PROFILE_VERSION,
    activeView: typeof object.activeView === "string" ? object.activeView : views[0]?.name,
    views
  };

  return { profile: errors.length && options.strict ? null : profile, errors };
}

export function parseProfileText(text: string, schema: ProfileSchema) {
  const normalized = normalizeProfileFile(parse(text), schema, { strict: true });
  if (!normalized.profile) {
    throw new Error(normalized.errors.join("\n") || "Invalid profile file.");
  }
  return normalized.profile;
}

export function stringifyProfileFile(profile: ProfileFile) {
  return stringify(profile, { lineWidth: 120 });
}
