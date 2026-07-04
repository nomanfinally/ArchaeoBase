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
  sort?: SortSpec[];
  page?: number;
  pageSize?: number;
  visibleColumns?: string[];
  mapBounds?: MapBounds | null;
  admixtureRunId?: number | null;
};

export type SqlFragment = {
  text: string;
  params: unknown[];
};
