export const G25_DIMENSION_COUNT = 25;

export type G25CoordinateKey = `g25_coord_${number}`;

export type G25ParsedRow = {
  coordsName: string;
  geneticId: string;
  source: string | null;
  coordinates: Array<number | null>;
};

export type G25CsvLayout = {
  hasHeader: boolean;
  nameIndex: number;
  geneticIdIndex: number | null;
  sourceIndex: number | null;
  g25LineIndex: number | null;
  coordinateIndexes: number[];
};

export const G25_NAME_FIELD_ID = "g25_name";
export const G25_SOURCE_FIELD_ID = "g25_source";
export const G25_LINE_FIELD_ID = "g25_line";

export const G25_COORD_FIELD_IDS = Array.from(
  { length: G25_DIMENSION_COUNT },
  (_, index) => `g25_coord_${index + 1}` as G25CoordinateKey
);

export const G25_EXPORT_COLUMNS = [
  { id: G25_LINE_FIELD_ID, label: "G25 Coordinates" },
  { id: G25_SOURCE_FIELD_ID, label: "G25 Source" }
];

export const G25_COORDINATE_EXPORT_COLUMNS = [
  { id: G25_LINE_FIELD_ID, label: "G25 Coordinates" },
  { id: G25_SOURCE_FIELD_ID, label: "G25 Source" }
];

function cleanNamePart(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/,+/g, "_");
}

export function buildG25FallbackName(groupId: unknown, geneticId: unknown) {
  const group = cleanNamePart(groupId);
  const genetic = cleanNamePart(geneticId);
  if (group && genetic) return `${group}:${genetic}`;
  return genetic || group || "";
}

export function inferGeneticIdFromG25Name(coordsName: string) {
  const trimmed = coordsName.trim();
  const samplePart = trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
  return samplePart.split("__", 1)[0]?.trim() ?? "";
}

export function formatG25Line(coordsName: string, coordinates: Array<number | string | null | undefined>) {
  const slots = Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => {
    const value = coordinates[index];
    return value === null || value === undefined ? "" : String(value);
  });
  return [coordsName, ...slots].join(",");
}

export function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function looksLikeCoordinateHeader(value: string, coordinateIndex: number) {
  const header = normalizedHeader(value).replace(/^0+/, "");
  const index = String(coordinateIndex);
  return [
    `pc${index}`,
    `pca${index}`,
    `coord_${index}`,
    `coordinate_${index}`,
    `g25_${index}`,
    `g25_coord_${index}`,
    `dim_${index}`,
    `c${index}`,
    index
  ].includes(header);
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalized = headers.map(normalizedHeader);
  return normalized.findIndex((header) => candidates.includes(header));
}

export function detectG25CsvLayout(firstRow: string[]): G25CsvLayout {
  const nameIndex = findHeaderIndex(firstRow, ["coords_name", "coordinate_name", "g25_name", "name", "sample", "sample_name"]);
  const geneticIdIndex = findHeaderIndex(firstRow, ["genetic_id", "sample_id", "individual_id"]);
  const sourceIndex = findHeaderIndex(firstRow, ["source", "g25_source", "dataset", "sheet", "reference"]);
  const g25LineIndex = findHeaderIndex(firstRow, ["g25", "g25_coordinates", "g25_coords", "coordinates"]);
  const coordinateIndexes = Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => (
    firstRow.findIndex((header) => looksLikeCoordinateHeader(header, index + 1))
  ));
  const hasCompleteCoordinateHeaders = coordinateIndexes.every((index) => index >= 0);
  const hasHeader = nameIndex >= 0 || geneticIdIndex >= 0 || sourceIndex >= 0 || g25LineIndex >= 0 || hasCompleteCoordinateHeaders;

  if (hasHeader) {
    const resolvedNameIndex = nameIndex >= 0 ? nameIndex : 0;
    const fallbackCoordinateIndexes = firstRow
      .map((_, index) => index)
      .filter((index) => index !== resolvedNameIndex && index !== geneticIdIndex && index !== sourceIndex && index !== g25LineIndex)
      .slice(0, G25_DIMENSION_COUNT);
    return {
      hasHeader: true,
      nameIndex: resolvedNameIndex,
      geneticIdIndex: geneticIdIndex >= 0 ? geneticIdIndex : null,
      sourceIndex: sourceIndex >= 0 ? sourceIndex : null,
      g25LineIndex: g25LineIndex >= 0 ? g25LineIndex : null,
      coordinateIndexes: hasCompleteCoordinateHeaders ? coordinateIndexes : fallbackCoordinateIndexes
    };
  }

  return {
    hasHeader: false,
    nameIndex: 0,
    geneticIdIndex: null,
    sourceIndex: null,
    g25LineIndex: null,
    coordinateIndexes: Array.from({ length: G25_DIMENSION_COUNT }, (_, index) => index + 1)
  };
}

function parseCoordinate(value: string, rowNumber: number, coordinateIndex: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`G25 row ${rowNumber} coordinate ${coordinateIndex} is not numeric: ${value}`);
  }
  return parsed;
}

export function parseG25CsvRows(text: string, defaultSource: string | null = null): G25ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!lines.length) return [];

  const firstRow = parseCsvLine(lines[0]);
  const layout = detectG25CsvLayout(firstRow);
  if (layout.g25LineIndex === null && layout.coordinateIndexes.length !== G25_DIMENSION_COUNT) {
    throw new Error(`G25 CSV must contain ${G25_DIMENSION_COUNT} coordinate columns.`);
  }

  const dataLines = layout.hasHeader ? lines.slice(1) : lines;
  return dataLines.flatMap((line, index) => {
    const rowNumber = (layout.hasHeader ? index + 2 : index + 1);
    const cells = parseCsvLine(line);
    const g25LineText = layout.g25LineIndex === null ? "" : cells[layout.g25LineIndex]?.trim() ?? "";
    if (layout.g25LineIndex !== null && !g25LineText) return [];
    const g25LineCells = layout.g25LineIndex === null ? null : parseCsvLine(g25LineText);
    const coordsName = (g25LineCells?.[0] ?? cells[layout.nameIndex] ?? "").trim();
    if (!coordsName) throw new Error(`G25 row ${rowNumber} is missing a coordinate name.`);
    const geneticId = layout.geneticIdIndex !== null
      ? cells[layout.geneticIdIndex]?.trim() ?? ""
      : inferGeneticIdFromG25Name(coordsName);
    if (!geneticId) throw new Error(`G25 row ${rowNumber} is missing a genetic ID.`);
    const source = layout.sourceIndex !== null ? cells[layout.sourceIndex]?.trim() || defaultSource : defaultSource;
    const coordinates = g25LineCells
      ? Array.from({ length: G25_DIMENSION_COUNT }, (_, coordinateIndex) => (
          parseCoordinate(g25LineCells[coordinateIndex + 1] ?? "", rowNumber, coordinateIndex + 1)
        ))
      : layout.coordinateIndexes.map((cellIndex, coordinateIndex) => (
          parseCoordinate(cells[cellIndex] ?? "", rowNumber, coordinateIndex + 1)
        ));
    return [{ coordsName, geneticId, source, coordinates }];
  });
}
