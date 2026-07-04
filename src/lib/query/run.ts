import { getLatestReleaseId, getPool } from "@/lib/db";
import { compileGlobalSearch, compileMapBounds, compileSampleFilter, mergeWhere } from "@/lib/filters/compile";
import type { QueryRequest, SortSpec, SqlFragment } from "@/lib/filters/types";
import { groupFieldById, sampleFieldById, sampleFields } from "@/lib/schema/fields";

const SAMPLE_SELECT_COLUMNS = [
  "s.id",
  ...sampleFields.map((field) => `${field.sampleColumn} AS "${field.id}"`)
];

const SAMPLE_MAP_SELECT_COLUMNS = [
  "s.id",
  's.genetic_id AS "genetic_id"',
  's.group_id AS "group_id"',
  's.locality AS "locality"',
  's.political_entity AS "political_entity"',
  's.date_mean_year_ce AS "date_mean_year_ce"',
  's.snp_1240k AS "snp_1240k"',
  's.molecular_sex AS "molecular_sex"',
  's.y_hap_isogg AS "y_hap_isogg"',
  's.y_hap_terminal AS "y_hap_terminal"',
  's.mtdna_haplogroup AS "mtdna_haplogroup"',
  's.data_type AS "data_type"',
  's.assessment AS "assessment"',
  's.latitude AS "latitude"',
  's.longitude AS "longitude"'
];

const MAX_PAGE_SIZE = 500;
const MAX_MAP_SIZE = 30000;

function clampPage(value: unknown) {
  const page = Number(value ?? 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clampPageSize(value: unknown, view: QueryRequest["view"]) {
  const limit = view === "map" ? MAX_MAP_SIZE : MAX_PAGE_SIZE;
  const requested = Number(value ?? 100);
  if (!Number.isFinite(requested) || requested < 1) return 100;
  return Math.min(Math.floor(requested), limit);
}

function offsetParams(text: string, offset: number) {
  if (!offset) return text;
  return text.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`);
}

function buildSampleWhere(request: QueryRequest, releaseId: string, requireCoordinates = false) {
  const filter = compileSampleFilter(request.filter);
  const globalSearch = compileGlobalSearch(request.globalSearch, request.searchField);
  const mapBounds = request.view === "map" ? compileMapBounds(request.mapBounds) : { text: "TRUE", params: [] };
  const releaseFilter: SqlFragment = { text: "s.release_id = $1", params: [releaseId] };
  const coordinateFilter: SqlFragment = requireCoordinates
    ? { text: "s.has_coordinates IS TRUE AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL", params: [] }
    : { text: "TRUE", params: [] };

  return mergeWhere([releaseFilter, filter, globalSearch, mapBounds, coordinateFilter]);
}

function buildOrderBy(sort: SortSpec[] | undefined, entity: QueryRequest["entity"]) {
  const fallback = entity === "sample" ? "s.genetic_id ASC" : "g.group_id ASC";
  if (!sort?.length) return fallback;

  const pieces = sort
    .slice(0, 3)
    .map((spec) => {
      const direction = spec.direction === "desc" ? "DESC" : "ASC";
      const field = entity === "sample" ? sampleFieldById[spec.field] : groupFieldById[spec.field];
      const column = entity === "sample" ? field?.sampleColumn : field?.groupColumn;
      if (!field?.sortable || !column) return null;
      return `${column} ${direction} NULLS LAST`;
    })
    .filter(Boolean);

  return pieces.length ? pieces.join(", ") : fallback;
}

function addLimitOffset(sql: string, params: unknown[], page: number, pageSize: number) {
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;
  return {
    text: `${sql} LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params: [...params, pageSize, (page - 1) * pageSize]
  };
}

function parseAdmixtureRunId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function querySamples(request: QueryRequest) {
  const pool = getPool();
  const release = await getLatestReleaseId();
  const page = clampPage(request.page);
  const pageSize = clampPageSize(request.pageSize, request.view);
  const where = buildSampleWhere(request, release.id, request.view === "map");
  const orderBy = request.view === "map" && !request.sort?.length ? "s.id ASC" : buildOrderBy(request.sort, "sample");
  const admixtureRunId = parseAdmixtureRunId(request.admixtureRunId);

  const selectParams = [...where.params];
  const admixtureSelect = request.view !== "map" && admixtureRunId
    ? `, (
        SELECT jsonb_object_agg(av.component_index, av.fraction ORDER BY av.component_index)
        FROM admixture_values av
        WHERE av.sample_id = s.id AND av.run_id = $${selectParams.push(admixtureRunId)}
      ) AS admixture`
    : request.view === "map"
      ? ""
      : ", NULL::jsonb AS admixture";
  const selectColumns = request.view === "map" ? SAMPLE_MAP_SELECT_COLUMNS : SAMPLE_SELECT_COLUMNS;

  const query = addLimitOffset(
    `
      SELECT ${selectColumns.join(", ")}
      ${admixtureSelect}
      FROM samples s
      WHERE ${where.text}
      ORDER BY ${orderBy}
    `,
    selectParams,
    page,
    pageSize
  );

  const count = await pool.query(`SELECT count(*)::integer AS total FROM samples s WHERE ${where.text}`, where.params);
  const rows = await pool.query(query.text, query.params);

  return {
    entity: "sample",
    release,
    page,
    pageSize,
    total: count.rows[0]?.total ?? 0,
    rows: rows.rows
  };
}

async function queryGroups(request: QueryRequest) {
  const pool = getPool();
  const release = await getLatestReleaseId();
  const page = clampPage(request.page);
  const pageSize = clampPageSize(request.pageSize, request.view);
  const where = buildSampleWhere(request, release.id);
  const orderBy = buildOrderBy(request.sort, "group");
  const admixtureRunId = parseAdmixtureRunId(request.admixtureRunId);

  const commonParams = [...where.params];
  const admixtureJoin = admixtureRunId
    ? `
      , group_admixture AS (
        SELECT group_id, jsonb_object_agg(component_index, fraction_avg ORDER BY component_index) AS admixture
        FROM (
          SELECT fs.group_id, av.component_index, avg(av.fraction) AS fraction_avg
          FROM filtered_samples fs
          JOIN admixture_values av ON av.sample_id = fs.id AND av.run_id = $${commonParams.push(admixtureRunId)}
          GROUP BY fs.group_id, av.component_index
        ) q
        GROUP BY group_id
      )
    `
    : "";
  const admixtureSelect = admixtureRunId ? "ga.admixture" : "NULL::jsonb AS admixture";
  const admixtureFrom = admixtureRunId ? "LEFT JOIN group_admixture ga ON ga.group_id = g.group_id" : "";

  const baseCte = `
    WITH filtered_samples AS (
      SELECT s.*
      FROM samples s
      WHERE ${where.text}
    ),
    group_rows AS (
      SELECT
        fs.group_id,
        count(*)::integer AS sample_count,
        string_agg(DISTINCT fs.political_entity, ', ' ORDER BY fs.political_entity) AS countries_text,
        array_remove(array_agg(DISTINCT fs.political_entity ORDER BY fs.political_entity), NULL) AS countries,
        array_remove(array_agg(DISTINCT fs.locality ORDER BY fs.locality), NULL) AS localities,
        string_agg(DISTINCT fs.locality, '; ' ORDER BY fs.locality) AS localities_text,
        count(DISTINCT fs.locality)::integer AS locality_count,
        count(DISTINCT CASE WHEN fs.has_coordinates THEN concat(fs.latitude, ',', fs.longitude) END)::integer AS coordinate_count,
        (count(DISTINCT CASE WHEN fs.has_coordinates THEN concat(fs.latitude, ',', fs.longitude) END) > 1) AS is_multi_site,
        string_agg(DISTINCT fs.molecular_sex, ', ' ORDER BY fs.molecular_sex) AS molecular_sexes,
        string_agg(DISTINCT fs.publication, ', ' ORDER BY fs.publication) AS publications,
        string_agg(DISTINCT fs.y_hap_isogg, ', ' ORDER BY fs.y_hap_isogg) AS y_hap_isogg_list,
        string_agg(DISTINCT fs.y_hap_terminal, ', ' ORDER BY fs.y_hap_terminal) AS y_hap_terminal_list,
        string_agg(DISTINCT fs.mtdna_haplogroup, ', ' ORDER BY fs.mtdna_haplogroup) AS mtdna_haplogroups,
        string_agg(DISTINCT fs.assessment, ', ' ORDER BY fs.assessment) AS assessments,
        min(fs.date_mean_bp) AS date_min_bp,
        max(fs.date_mean_bp) AS date_max_bp,
        min(fs.date_mean_year_ce) AS year_min_ce,
        max(fs.date_mean_year_ce) AS year_max_ce,
        avg(fs.latitude) FILTER (WHERE fs.has_coordinates)::double precision AS centroid_latitude,
        avg(fs.longitude) FILTER (WHERE fs.has_coordinates)::double precision AS centroid_longitude,
        avg(fs.snp_1240k)::double precision AS snp_1240k_avg,
        avg(fs.snp_2m)::double precision AS snp_2m_avg,
        avg(fs.coverage_1150k)::double precision AS coverage_1150k_avg,
        min(fs.snp_1240k) AS snp_1240k_min,
        max(fs.snp_1240k) AS snp_1240k_max
      FROM filtered_samples fs
      WHERE fs.group_id IS NOT NULL
      GROUP BY fs.group_id
    )
    ${admixtureJoin}
  `;

  const count = await pool.query(
    `
      WITH filtered_samples AS (
        SELECT s.group_id
        FROM samples s
        WHERE ${where.text}
      )
      SELECT count(*)::integer AS total
      FROM (SELECT group_id FROM filtered_samples WHERE group_id IS NOT NULL GROUP BY group_id) grouped
    `,
    where.params
  );

  const selectSql = `
    ${baseCte}
    SELECT g.*, ${admixtureSelect}
    FROM group_rows g
    ${admixtureFrom}
    ORDER BY ${orderBy}
  `;

  const query = addLimitOffset(selectSql, commonParams, page, pageSize);
  const rows = await pool.query(query.text, query.params);

  return {
    entity: "group",
    release,
    page,
    pageSize,
    total: count.rows[0]?.total ?? 0,
    rows: rows.rows
  };
}

export async function runQuery(request: QueryRequest) {
  if (request.entity === "group") return queryGroups(request);
  return querySamples(request);
}
