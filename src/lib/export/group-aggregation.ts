export type ExportColumn = {
  id: string;
  label: string;
};

export const UNIQUE_GROUP_EXPORT_COLUMNS: ExportColumn[] = [
  { id: "group_id", label: "Group ID" },
  { id: "sample_count", label: "Sample Nos" },
  { id: "genetic_id", label: "Genetic IDs" },
  { id: "y_hap_isogg", label: "Y Haplogroups ISOGG" },
  { id: "mtdna_haplogroup", label: "mtDNA Haplogroups" },
  { id: "period", label: "Period Names" },
  { id: "political_entity", label: "Political Entities" },
  { id: "molecular_sex", label: "Molecular Sexes" },
  { id: "locality", label: "Localities" },
  { id: "suffixes", label: "Suffices" },
  { id: "publication", label: "Publications" },
  { id: "doi", label: "DOIs" },
  { id: "latitude", label: "Latitude" },
  { id: "longitude", label: "Longitude" },
  { id: "snp_1240k_avg", label: "Avg SNPs 1240k" },
  { id: "snp_2m_avg", label: "Avg SNPs 2M" },
  { id: "date_mean_bp_range", label: "Date BP Range" },
  { id: "date_mean_bp_avg", label: "Avg Date BP" },
  { id: "date_mean_year_ce_range", label: "Year CE Range" },
  { id: "date_mean_year_ce_avg", label: "Avg Year CE" }
];

const textAggregateFields = [
  "genetic_id",
  "y_hap_isogg",
  "mtdna_haplogroup",
  "period",
  "political_entity",
  "molecular_sex",
  "locality",
  "suffixes",
  "publication",
  "doi"
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function uniqueComma(values: unknown[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const text = asText(value);
    if (text) unique.add(text);
  }
  return Array.from(unique).join(", ");
}

function formatNumber(value: number, digits = 2) {
  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function numericSegments(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 4) return sorted.length ? [sorted] : [];

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  if (q1 === null || q3 === null) return [sorted];
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const inliers = sorted.filter((value) => value >= lowerFence && value <= upperFence);
  const outliers = sorted.filter((value) => value < lowerFence || value > upperFence);
  if (!outliers.length || !inliers.length) return [sorted];
  return [inliers, ...outliers.map((value) => [value])];
}

function rangeForSegment(segment: number[]) {
  if (!segment.length) return "";
  const min = Math.min(...segment);
  const max = Math.max(...segment);
  if (min === max) return formatNumber(min);
  return `${formatNumber(min)}-${formatNumber(max)}`;
}

function segmentedRange(values: number[]) {
  return numericSegments(values).map(rangeForSegment).filter(Boolean).join("; ");
}

function segmentedAverage(values: number[]) {
  return numericSegments(values)
    .map((segment) => average(segment))
    .filter((value): value is number => value !== null)
    .map((value) => formatNumber(value))
    .join("; ");
}

function coordinateSegments(rows: Record<string, unknown>[]) {
  const coordinates = new Map<string, { latitude: number; longitude: number }>();
  for (const row of rows) {
    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    if (latitude === null || longitude === null) continue;
    coordinates.set(`${latitude.toFixed(6)},${longitude.toFixed(6)}`, { latitude, longitude });
  }
  const ordered = Array.from(coordinates.values());
  return {
    latitude: ordered.map((coordinate) => formatNumber(coordinate.latitude, 6)).join("; "),
    longitude: ordered.map((coordinate) => formatNumber(coordinate.longitude, 6)).join("; ")
  };
}

export function aggregateUniqueGroupRows(rows: Record<string, unknown>[]) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const [index, row] of rows.entries()) {
    const groupId = asText(row.group_id);
    const fallbackId = asText(row.genetic_id) || String(index + 1);
    const key = groupId || `__no_group__:${fallbackId}`;
    const current = groups.get(key);
    if (current) current.push(row);
    else groups.set(key, [row]);
  }

  return Array.from(groups.values()).map((groupRows) => {
    const first = groupRows[0] ?? {};
    const coordinates = coordinateSegments(groupRows);
    const dateBpValues = groupRows.map((row) => asNumber(row.date_mean_bp)).filter((value): value is number => value !== null);
    const yearCeValues = groupRows.map((row) => asNumber(row.date_mean_year_ce)).filter((value): value is number => value !== null);
    const snp1240kValues = groupRows.map((row) => asNumber(row.snp_1240k)).filter((value): value is number => value !== null);
    const snp2mValues = groupRows.map((row) => asNumber(row.snp_2m)).filter((value): value is number => value !== null);
    const row: Record<string, unknown> = {
      group_id: asText(first.group_id),
      sample_count: groupRows.length,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      snp_1240k_avg: average(snp1240kValues) === null ? "" : formatNumber(average(snp1240kValues) ?? 0),
      snp_2m_avg: average(snp2mValues) === null ? "" : formatNumber(average(snp2mValues) ?? 0),
      date_mean_bp_range: segmentedRange(dateBpValues),
      date_mean_bp_avg: segmentedAverage(dateBpValues),
      date_mean_year_ce_range: segmentedRange(yearCeValues),
      date_mean_year_ce_avg: segmentedAverage(yearCeValues)
    };

    for (const field of textAggregateFields) {
      row[field] = uniqueComma(groupRows.map((groupRow) => groupRow[field]));
    }
    return row;
  });
}
