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
  { label: "Paleolithic", startYear: MIN_YEAR, endYear: -10050, light: "#1e3a8a", dark: "#2563eb" },
  { label: "Mesolithic (Early)", startYear: -10050, endYear: -8050, light: "#1d4ed8", dark: "#3b82f6" },
  { label: "Mesolithic (Late)", startYear: -8050, endYear: -6050, light: "#0369a1", dark: "#0891b2" },
  { label: "Neolithic (EN)", startYear: -6050, endYear: -5350, light: "#854d0e", dark: "#b45309" },
  { label: "Neolithic (MN)", startYear: -5350, endYear: -4850, light: "#92400e", dark: "#d97706" },
  { label: "Neolithic (LN)", startYear: -4850, endYear: -4350, light: "#a16207", dark: "#ca8a04" },
  { label: "Chalcolithic", startYear: -4350, endYear: -3350, light: "#7c2d12", dark: "#c2410c" },
  { label: "Bronze Age (EBA)", startYear: -3350, endYear: -2350, light: "#7c3aed", dark: "#8b5cf6" },
  { label: "Bronze Age (MBA)", startYear: -2350, endYear: -1900, light: "#a21caf", dark: "#d946ef" },
  { label: "Bronze Age (MLBA)", startYear: -1900, endYear: -1500, light: "#e11d48", dark: "#fb7185" },
  { label: "Bronze Age (LBA)", startYear: -1500, endYear: -1200, light: "#991b1b", dark: "#ef4444" },
  { label: "Iron Age", startYear: -1200, endYear: -550, light: "#047857", dark: "#10b981" },
  { label: "Classical", startYear: -550, endYear: 500, light: "#0f766e", dark: "#14b8a6" },
  { label: "Medieval", startYear: 500, endYear: 1500, light: "#6d28d9", dark: "#a855f7" },
  { label: "Modern", startYear: 1500, endYear: MAX_YEAR, light: "#be123c", dark: "#f43f5e" }
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
