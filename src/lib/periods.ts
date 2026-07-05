export type PeriodDefinition = {
  label: string;
  startYear: number;
  endYear: number;
  light: string;
  dark: string;
};

export type PeriodOption = Pick<PeriodDefinition, "label" | "startYear" | "endYear">;

export const MIN_YEAR = -60000;
export const MAX_YEAR = 2026;
export const PRESENT_YEAR = 1950;

export const UNKNOWN_PERIOD = {
  label: "Unknown",
  sort: 999,
  light: "#8d8980",
  dark: "#8d8980"
};

export const defaultPeriodDefinitions: PeriodDefinition[] = [
  { label: "Paleolithic", startYear: MIN_YEAR, endYear: -10050, light: "#334155", dark: "#94a3b8" },
  { label: "Early Mesolithic", startYear: -10050, endYear: -8050, light: "#0f766e", dark: "#2dd4bf" },
  { label: "Late Mesolithic", startYear: -8050, endYear: -6050, light: "#0e7490", dark: "#22d3ee" },
  { label: "Early Neolithic", startYear: -6050, endYear: -5350, light: "#3f7c2b", dark: "#a3e635" },
  { label: "Middle Neolithic", startYear: -5350, endYear: -4850, light: "#65a30d", dark: "#84cc16" },
  { label: "Late Neolithic", startYear: -4850, endYear: -4350, light: "#a16207", dark: "#facc15" },
  { label: "Chalcolithic", startYear: -4350, endYear: -3350, light: "#c2410c", dark: "#fb923c" },
  { label: "Early Bronze Age", startYear: -3350, endYear: -2350, light: "#b45309", dark: "#f59e0b" },
  { label: "Middle Bronze Age", startYear: -2350, endYear: -1650, light: "#9a3412", dark: "#fb7185" },
  { label: "Late Bronze Age", startYear: -1650, endYear: -1200, light: "#7c2d12", dark: "#ef4444" },
  { label: "Iron Age", startYear: -1200, endYear: -550, light: "#5b21b6", dark: "#c084fc" },
  { label: "Classical", startYear: -550, endYear: 500, light: "#be123c", dark: "#fb7185" },
  { label: "Medieval", startYear: 500, endYear: 1500, light: "#6d28d9", dark: "#a78bfa" },
  { label: "Modern", startYear: 1500, endYear: MAX_YEAR, light: "#475569", dark: "#cbd5e1" }
];

export const defaultPeriodOptions: PeriodOption[] = defaultPeriodDefinitions.map(({ label, startYear, endYear }) => ({
  label,
  startYear,
  endYear
}));

function normalizeDateExpression(dateExpression: string) {
  return `1950 - ${dateExpression}`;
}

export function buildPeriodLabelSql(dateExpression: string) {
  const yearExpression = normalizeDateExpression(dateExpression);
  const cases = defaultPeriodDefinitions
    .map((period) => `WHEN ${yearExpression} >= ${period.startYear} AND ${yearExpression} < ${period.endYear} THEN '${period.label.replace(/'/g, "''")}'`)
    .join("\n  ");
  return `CASE
  WHEN ${dateExpression} IS NULL THEN NULL
  ${cases}
  ELSE NULL
END`;
}

export function buildPeriodSortSql(dateExpression: string) {
  const yearExpression = normalizeDateExpression(dateExpression);
  const cases = defaultPeriodDefinitions
    .map((period, index) => `WHEN ${yearExpression} >= ${period.startYear} AND ${yearExpression} < ${period.endYear} THEN ${index}`)
    .join("\n  ");
  return `CASE
  WHEN ${dateExpression} IS NULL THEN 999
  ${cases}
  ELSE 999
END`;
}

export function periodInfo(dateMeanBp: number | null | undefined) {
  if (dateMeanBp === null || dateMeanBp === undefined || !Number.isFinite(dateMeanBp)) {
    return UNKNOWN_PERIOD;
  }
  const year = PRESENT_YEAR - dateMeanBp;
  const index = defaultPeriodDefinitions.findIndex((period) => year >= period.startYear && year < period.endYear);
  if (index < 0) return UNKNOWN_PERIOD;
  const period = defaultPeriodDefinitions[index];
  return {
    label: period.label,
    sort: index,
    light: period.light,
    dark: period.dark
  };
}
