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
  light: "#000000",
  dark: "#000000"
};

export const defaultPeriodDefinitions: PeriodDefinition[] = [
  { label: "Paleolithic", startYear: MIN_YEAR, endYear: -10050, light: "#0b3a75", dark: "#1e3a8a" },
  { label: "Mesolithic (Early)", startYear: -10050, endYear: -8050, light: "#0ea5e9", dark: "#60a5fa" },
  { label: "Mesolithic (Late)", startYear: -8050, endYear: -6050, light: "#0891b2", dark: "#22d3ee" },
  { label: "Neolithic (EN)", startYear: -6050, endYear: -5350, light: "#15803d", dark: "#22c55e" },
  { label: "Neolithic (MN)", startYear: -5350, endYear: -4850, light: "#65a30d", dark: "#84cc16" },
  { label: "Neolithic (LN)", startYear: -4850, endYear: -4350, light: "#ca8a04", dark: "#eab308" },
  { label: "Chalcolithic", startYear: -4350, endYear: -3350, light: "#92400e", dark: "#b45309" },
  { label: "Bronze Age (EBA)", startYear: -3350, endYear: -2350, light: "#e11d48", dark: "#fb7185" },
  { label: "Bronze Age (MBA)", startYear: -2350, endYear: -1900, light: "#dc2626", dark: "#ef4444" },
  { label: "Bronze Age (MLBA)", startYear: -1900, endYear: -1500, light: "#b91c1c", dark: "#dc2626" },
  { label: "Bronze Age (LBA)", startYear: -1500, endYear: -1200, light: "#7f1d1d", dark: "#991b1b" },
  { label: "Iron Age", startYear: -1200, endYear: -550, light: "#334155", dark: "#94a3b8" },
  { label: "Classical", startYear: -550, endYear: 500, light: "#0f766e", dark: "#14b8a6" },
  { label: "Medieval", startYear: 500, endYear: 1500, light: "#6d28d9", dark: "#a855f7" },
  { label: "Modern", startYear: 1500, endYear: MAX_YEAR, light: "#16a34a", dark: "#10b981" }
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
