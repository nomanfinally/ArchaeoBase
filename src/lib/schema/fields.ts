import { buildPeriodLabelSql } from "@/lib/periods";

export type FieldKind = "text" | "enum" | "number" | "year" | "boolean";
export type EntityKind = "sample" | "group";

export type Operator =
  | "contains"
  | "not_contains"
  | "contains_any"
  | "contains_all"
  | "not_contains_any"
  | "not_contains_all"
  | "starts_with"
  | "not_starts_with"
  | "ends_with"
  | "not_ends_with"
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_empty"
  | "is_not_empty";

export type FieldDefinition = {
  id: string;
  label: string;
  description?: string;
  kind: FieldKind;
  sampleColumn?: string;
  groupColumn?: string;
  defaultVisible?: boolean;
  filterable?: boolean;
  sortable?: boolean;
};

function sampleField(
  id: string,
  label: string,
  kind: FieldKind,
  options: Omit<FieldDefinition, "id" | "label" | "kind" | "sampleColumn"> = {}
): FieldDefinition {
  return {
    id,
    label,
    kind,
    sampleColumn: `s.${id}`,
    defaultVisible: false,
    filterable: true,
    sortable: true,
    ...options
  };
}

const PERIOD_SAMPLE_COLUMN = buildPeriodLabelSql("s.date_mean_bp");

export const sampleFields = [
  sampleField("genetic_id", "Genetic ID", "text", { defaultVisible: true }),
  sampleField("date_mean_bp", "Date BP", "number", { defaultVisible: true }),
  sampleField("date_sd_bp", "Date SD BP", "number"),
  sampleField("date_mean_year_ce", "Year CE", "year", { defaultVisible: true }),
  sampleField("group_id", "Group ID", "text", { defaultVisible: true }),
  sampleField("y_hap_isogg", "Y Haplogroup ISOGG", "text", { defaultVisible: true }),
  sampleField("mtdna_haplogroup", "mtDNA Haplogroup", "text", { defaultVisible: true }),
  sampleField("political_entity", "Political Entity", "enum", { defaultVisible: true }),
  sampleField("regions", "Regions", "enum", { defaultVisible: true }),
  sampleField("locality", "Locality", "text", { defaultVisible: true }),
  sampleField("suffixes", "Suffices", "enum", { defaultVisible: true }),
  sampleField("snp_1240k", "SNPs 1240k", "number", { defaultVisible: true }),
  sampleField("snp_2m", "SNPs 2M", "number"),
  sampleField("molecular_sex", "Molecular Sex", "enum", { defaultVisible: true }),
  sampleField("publication", "Publication", "text"),
  sampleField("doi", "DOI", "text"),
  sampleField("latitude", "Latitude", "number"),
  sampleField("longitude", "Longitude", "number"),
  {
    id: "period",
    label: "Period Name",
    kind: "enum",
    sampleColumn: PERIOD_SAMPLE_COLUMN,
    defaultVisible: true,
    filterable: true,
    sortable: true
  }
] satisfies FieldDefinition[];

export const groupFields = [
  {
    id: "group_id",
    label: "Group ID",
    kind: "text",
    groupColumn: "g.group_id",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "sample_count",
    label: "Samples",
    kind: "number",
    groupColumn: "g.sample_count",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "genetic_ids",
    label: "Genetic IDs",
    kind: "text",
    groupColumn: "g.genetic_ids",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "molecular_sexes",
    label: "Molecular Sexes",
    kind: "text",
    groupColumn: "g.molecular_sexes",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "countries",
    label: "Political Entities",
    kind: "text",
    groupColumn: "g.countries_text",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "regions",
    label: "Regions",
    kind: "text",
    groupColumn: "g.regions_text",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "localities",
    label: "Localities",
    kind: "text",
    groupColumn: "g.localities_text",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "locality_count",
    label: "Localities",
    kind: "number",
    groupColumn: "g.locality_count",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "coordinate_count",
    label: "Coordinate Sets",
    kind: "number",
    groupColumn: "g.coordinate_count",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "publications",
    label: "Publications",
    kind: "text",
    groupColumn: "g.publications",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "period_names",
    label: "Period Names",
    kind: "text",
    groupColumn: "g.period_names",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "y_hap_isogg_list",
    label: "Y Haplogroups ISOGG",
    kind: "text",
    groupColumn: "g.y_hap_isogg_list",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "mtdna_haplogroups",
    label: "mtDNA Haplogroups",
    kind: "text",
    groupColumn: "g.mtdna_haplogroups",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "date_min_bp",
    label: "Oldest BP",
    kind: "number",
    groupColumn: "g.date_min_bp",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "date_max_bp",
    label: "Youngest BP",
    kind: "number",
    groupColumn: "g.date_max_bp",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "centroid_latitude",
    label: "Centroid Lat",
    kind: "number",
    groupColumn: "g.centroid_latitude",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "centroid_longitude",
    label: "Centroid Long",
    kind: "number",
    groupColumn: "g.centroid_longitude",
    defaultVisible: false,
    sortable: true
  },
  {
    id: "snp_1240k_avg",
    label: "Avg SNPs 1240k",
    kind: "number",
    groupColumn: "g.snp_1240k_avg",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "snp_2m_avg",
    label: "Avg SNPs 2M",
    kind: "number",
    groupColumn: "g.snp_2m_avg",
    defaultVisible: false,
    sortable: true
  }
] satisfies FieldDefinition[];

export const filterableSampleFields = sampleFields.filter((field) => field.filterable);

export const sampleFieldById = Object.fromEntries(sampleFields.map((field) => [field.id, field])) as Record<
  string,
  FieldDefinition
>;
export const groupFieldById = Object.fromEntries(groupFields.map((field) => [field.id, field])) as Record<
  string,
  FieldDefinition
>;

export const operatorsByKind: Record<FieldKind, Operator[]> = {
  text: [
    "contains",
    "not_contains",
    "contains_any",
    "contains_all",
    "not_contains_any",
    "not_contains_all",
    "starts_with",
    "not_starts_with",
    "ends_with",
    "not_ends_with",
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty"
  ],
  enum: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  year: ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  boolean: ["equals"]
};

export const defaultSampleColumnIds = sampleFields.filter((field) => field.defaultVisible).map((field) => field.id);
export const defaultGroupColumnIds = groupFields.filter((field) => field.defaultVisible).map((field) => field.id);
