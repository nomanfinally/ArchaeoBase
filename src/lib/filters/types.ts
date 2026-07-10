export type FilterOp = "and" | "or" | "not";

export type FilterCondition = {
  type: "condition";
  field: string;
  operator: string;
  value?: unknown;
};

export type FilterGroup = {
  type: "group";
  op: FilterOp;
  children: FilterNode[];
};

export type FilterNode = FilterCondition | FilterGroup;

export type SortDirection = "asc" | "desc";

export type SortSpec = {
  field: string;
  direction: SortDirection;
};

export type SnpAlleleRole = "ref" | "alt";
export type SnpCopyState = 0 | 1 | 2 | "missing";

export type SnpFilter = {
  snpId: string;
  alleleRole: SnpAlleleRole;
  copyStates: SnpCopyState[];
};

export type SnpColumnSpec = {
  snpId: string;
};

export type SnpColorSpec = {
  snpId: string;
  alleleRole: SnpAlleleRole;
};

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type QueryRequest = {
  entity: "sample" | "group";
  view: "table" | "map";
  filter?: FilterNode | null;
  globalSearch?: string;
  searchField?: string | null;
  sort?: SortSpec[];
  page?: number;
  pageSize?: number;
  visibleColumns?: string[];
  mapBounds?: MapBounds | null;
  admixtureRunId?: number | null;
  snpFilters?: SnpFilter[];
  snpColumns?: SnpColumnSpec[];
  snpColor?: SnpColorSpec | null;
};

export type SqlFragment = {
  text: string;
  params: unknown[];
};
