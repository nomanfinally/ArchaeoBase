import periodDefinitionData from "../../data/period_definitions.json";

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

export const defaultPeriodDefinitions: PeriodDefinition[] = periodDefinitionData;

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
