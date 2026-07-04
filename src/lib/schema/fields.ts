export type FieldKind = "text" | "enum" | "number" | "year" | "boolean";
export type EntityKind = "sample" | "group";

export type Operator =
  | "contains"
  | "not_contains"
  | "starts_with"
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

export const sampleFields = [
  sampleField("genetic_id", "Genetic ID", "text", { defaultVisible: true }),
  sampleField("persistent_genetic_id", "Persistent Genetic ID", "text"),
  sampleField("individual_id", "Individual ID", "text"),
  sampleField("skeletal_code", "Skeletal Code", "text"),
  sampleField("skeletal_element", "Skeletal Element", "text"),
  sampleField("first_publication", "First Publication", "text"),
  sampleField("publication", "Publication", "text"),
  sampleField("doi", "DOI", "text"),
  sampleField("repository", "Repository", "text"),
  sampleField("date_method", "Date Method", "text"),
  sampleField("date_mean_bp", "Date BP", "number", { defaultVisible: true }),
  sampleField("date_sd_bp", "Date SD BP", "number"),
  sampleField("date_mean_year_ce", "Year CE", "year", { defaultVisible: true }),
  sampleField("full_date", "Full Date", "text", { sortable: false }),
  sampleField("age_morphological", "Age / Morphological Sex", "text"),
  sampleField("group_id", "Group ID", "text", { defaultVisible: true }),
  sampleField("locality", "Locality", "text", { defaultVisible: true }),
  sampleField("political_entity", "Political Entity", "enum", { defaultVisible: true }),
  sampleField("latitude", "Latitude", "number"),
  sampleField("longitude", "Longitude", "number"),
  sampleField("has_coordinates", "Has Coordinates", "boolean"),
  sampleField("pulldown_strategy", "Pulldown Strategy", "text"),
  sampleField("suffixes", "Suffices", "enum", { defaultVisible: true }),
  sampleField("data_type", "Data Type", "enum", { defaultVisible: true }),
  sampleField("no_libraries", "No. Libraries", "number"),
  sampleField("coverage_1150k", "Coverage 1.15M", "number"),
  sampleField("coverage_non_targeted", "Coverage Non-targeted", "number"),
  sampleField("snp_2m", "SNPs 2M", "number"),
  sampleField("snp_1240k", "SNPs 1240k", "number", { defaultVisible: true }),
  sampleField("snp_ho", "SNPs HO", "number"),
  sampleField("snp_compatibility", "SNPs Compatibility", "number"),
  sampleField("snp_compatibility_ho", "SNPs Compatibility HO", "number"),
  sampleField("molecular_sex", "Molecular Sex", "enum", { defaultVisible: true }),
  sampleField("family_relations", "Family Relations", "text"),
  sampleField("roh_total_20cm_a", "ROH >20cM A", "number"),
  sampleField("roh_total_20cm_b", "ROH >20cM B", "number"),
  sampleField("y_hap_terminal", "Y Haplogroup Terminal", "text", { defaultVisible: true }),
  sampleField("y_hap_isogg", "Y Haplogroup ISOGG", "text", { defaultVisible: true }),
  sampleField("y_hap_manual", "Y Haplogroup Manual", "text"),
  sampleField("mtdna_coverage", "mtDNA Coverage", "number"),
  sampleField("mtdna_haplogroup", "mtDNA Haplogroup", "text", { defaultVisible: true }),
  sampleField("mtdna_match_consensus", "mtDNA Match Consensus", "text"),
  sampleField("damage_rate", "Damage Rate", "number"),
  sampleField("sex_ratio", "Sex Ratio", "number"),
  sampleField("angsd_mom_ci", "ANGSD MOM CI", "text"),
  sampleField("hapconx_ci", "hapConX CI", "text"),
  sampleField("library_type", "Library Type", "text"),
  sampleField("libraries", "Libraries", "text", { sortable: false }),
  sampleField("endogenous_by_library", "Endogenous by Library", "text", { sortable: false }),
  sampleField("assessment", "Assessment", "enum", { defaultVisible: true }),
  sampleField("assessment_warnings", "Assessment Warnings", "text", { sortable: false })
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
    id: "is_multi_site",
    label: "Multi-site",
    kind: "boolean",
    groupColumn: "g.is_multi_site",
    defaultVisible: true,
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
    id: "y_hap_isogg_list",
    label: "Y Haplogroups ISOGG",
    kind: "text",
    groupColumn: "g.y_hap_isogg_list",
    defaultVisible: true,
    sortable: true
  },
  {
    id: "y_hap_terminal_list",
    label: "Y Haplogroups Terminal",
    kind: "text",
    groupColumn: "g.y_hap_terminal_list",
    defaultVisible: false,
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
    id: "assessments",
    label: "Assessments",
    kind: "text",
    groupColumn: "g.assessments",
    defaultVisible: false,
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
  },
  {
    id: "coverage_1150k_avg",
    label: "Avg Coverage 1.15M",
    kind: "number",
    groupColumn: "g.coverage_1150k_avg",
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
  text: ["contains", "not_contains", "starts_with", "equals", "not_equals", "is_empty", "is_not_empty"],
  enum: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  year: ["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  boolean: ["equals"]
};

export const defaultSampleColumnIds = sampleFields.filter((field) => field.defaultVisible).map((field) => field.id);
export const defaultGroupColumnIds = groupFields.filter((field) => field.defaultVisible).map((field) => field.id);
