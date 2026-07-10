import type { Pool, PoolClient } from "pg";
import type { SnpAlleleRole, SnpColorSpec, SnpColumnSpec, SnpCopyState, SnpFilter } from "@/lib/filters/types";
import {
  countsForCallCode,
  decodePackedCallCodes,
  formatGenotypeCall,
  readPackedGenoHeader,
  readPackedGenotypeRow
} from "./packed-ancestrymap";

type Queryable = Pool | PoolClient;

export type GenotypeDatasetRow = {
  id: string;
  release_id: string;
  name: string;
  source_geno_file: string;
  source_snp_file: string;
  source_ind_file: string;
  sample_count: number;
  variant_count: number;
  row_bytes: number;
  header_sample_hash: string | null;
  header_variant_hash: string | null;
};

export type GenotypeVariantRow = {
  id: string;
  dataset_id: string;
  variant_index: number;
  snp_id: string;
  chromosome: string;
  genetic_position: number | null;
  physical_position: string | number | null;
  ref_allele: string | null;
  alt_allele: string | null;
};

export type GenotypeVariantSearchRow = GenotypeVariantRow & {
  cached: boolean;
  cached_count: number;
  sample_count: number;
};

export type PreparedSnpFilter = GenotypeVariantRow & {
  alleleRole: SnpAlleleRole;
  copyStates: SnpCopyState[];
  countStates: number[];
  includesMissing: boolean;
  columnId: string;
  columnLabel: string;
  joinAlias: string;
};

export type PreparedSnpColumn = GenotypeVariantRow & {
  columnId: string;
  columnLabel: string;
  joinAlias: string;
  fromFilter: boolean;
};

export type PreparedSnpColor = GenotypeVariantRow & {
  alleleRole: SnpAlleleRole;
  title: string;
};

export type SnpSql = {
  joins: string;
  whereText: string;
  params: unknown[];
};

export type SnpColumnDefinition = {
  id: string;
  label: string;
  kind: "text";
  sortable: true;
  defaultVisible: true;
};

const VALID_COPY_STATES = new Set<SnpCopyState>([0, 1, 2, "missing"]);

function asInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeCopyStates(values: SnpCopyState[] | undefined) {
  const states: SnpCopyState[] = [];
  for (const value of values ?? []) {
    const normalized = value === "missing" ? "missing" : asInteger(value);
    if (!VALID_COPY_STATES.has(normalized as SnpCopyState)) continue;
    if (!states.includes(normalized as SnpCopyState)) states.push(normalized as SnpCopyState);
  }
  return states;
}

function normalizeAlleleRole(value: unknown): SnpAlleleRole {
  return value === "ref" ? "ref" : "alt";
}

function sqlString(value: string | null | undefined) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function snpColumnId(variantId: string | number) {
  return `snp_${variantId}`;
}

export function snpColumnLabel(variant: Pick<GenotypeVariantRow, "snp_id" | "ref_allele" | "alt_allele">) {
  return `${variant.snp_id} ${variant.ref_allele ?? "?"}/${variant.alt_allele ?? "?"}`;
}

export function genotypeLabelSql(alias: string, variant: Pick<GenotypeVariantRow, "ref_allele" | "alt_allele">) {
  const ref = variant.ref_allele ?? "?";
  const alt = variant.alt_allele ?? "?";
  return `CASE ${alias}.call_code
    WHEN 0 THEN ${sqlString(`${alt}/${alt}`)}
    WHEN 1 THEN ${sqlString(`${ref}/${alt}`)}
    WHEN 2 THEN ${sqlString(`${ref}/${ref}`)}
    WHEN 3 THEN 'missing'
    ELSE NULL
  END`;
}

export function genotypeLabelForVariant(callCode: number | null | undefined, variant: Pick<GenotypeVariantRow, "ref_allele" | "alt_allele">) {
  return formatGenotypeCall(callCode, variant.ref_allele, variant.alt_allele);
}

export async function getLatestGenotypeDataset(db: Queryable, releaseId: string | number) {
  const result = await db.query<GenotypeDatasetRow>(
    `
      SELECT *
      FROM genotype_datasets
      WHERE release_id = $1
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
    `,
    [releaseId]
  );
  if (!result.rowCount) {
    throw new Error("No genotype dataset has been indexed. Run npm run import:genotype-index.");
  }
  return result.rows[0];
}

export async function findVariantBySnpId(db: Queryable, datasetId: string | number, snpId: string) {
  const result = await db.query<GenotypeVariantRow>(
    `
      SELECT *
      FROM genotype_variants
      WHERE dataset_id = $1 AND snp_id = $2
      ORDER BY variant_index ASC
    `,
    [datasetId, snpId]
  );
  if (!result.rowCount) {
    throw new Error(`SNP '${snpId}' was not found in the indexed genotype dataset.`);
  }
  if (result.rowCount > 1) {
    throw new Error(`SNP '${snpId}' maps to ${result.rowCount} variants. Select by a unique SNP ID in v1.`);
  }
  return result.rows[0];
}

export async function searchGenotypeVariants(db: Queryable, releaseId: string | number, query: string, limit = 30) {
  const dataset = await getLatestGenotypeDataset(db, releaseId);
  const trimmed = query.trim();
  const clampedLimit = Math.max(1, Math.min(80, Math.floor(limit)));
  if (!trimmed) {
    const result = await db.query<GenotypeVariantSearchRow>(
      `
        SELECT
          gv.*,
          gd.sample_count,
          cache.cached_count,
          cache.cached_count = gd.sample_count AS cached
        FROM genotype_variants gv
        JOIN genotype_datasets gd ON gd.id = gv.dataset_id
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS cached_count
          FROM genotype_variant_calls gvc
          WHERE gvc.variant_id = gv.id
        ) cache ON TRUE
        WHERE gv.dataset_id = $1
        ORDER BY gv.variant_index ASC
        LIMIT $2
      `,
      [dataset.id, clampedLimit]
    );
    return result.rows;
  }

  const positionMatch = trimmed.match(/^(?:chr)?([^:\s]+):(\d+)$/i);
  if (positionMatch) {
    const result = await db.query<GenotypeVariantSearchRow>(
      `
        SELECT
          gv.*,
          gd.sample_count,
          cache.cached_count,
          cache.cached_count = gd.sample_count AS cached
        FROM genotype_variants gv
        JOIN genotype_datasets gd ON gd.id = gv.dataset_id
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS cached_count
          FROM genotype_variant_calls gvc
          WHERE gvc.variant_id = gv.id
        ) cache ON TRUE
        WHERE gv.dataset_id = $1 AND lower(gv.chromosome) = lower($2) AND gv.physical_position = $3
        ORDER BY gv.variant_index ASC
        LIMIT $4
      `,
      [dataset.id, positionMatch[1], positionMatch[2], clampedLimit]
    );
    return result.rows;
  }

  const exactOrPrefix = `${trimmed.toLowerCase()}%`;
  const result = await db.query<GenotypeVariantSearchRow>(
    `
      SELECT
        gv.*,
        gd.sample_count,
        cache.cached_count,
        cache.cached_count = gd.sample_count AS cached
      FROM genotype_variants gv
      JOIN genotype_datasets gd ON gd.id = gv.dataset_id
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS cached_count
        FROM genotype_variant_calls gvc
        WHERE gvc.variant_id = gv.id
      ) cache ON TRUE
      WHERE gv.dataset_id = $1 AND lower(gv.snp_id) LIKE $2
      ORDER BY
        CASE WHEN lower(gv.snp_id) = lower($3) THEN 0 ELSE 1 END,
        gv.snp_id ASC,
        gv.variant_index ASC
      LIMIT $4
    `,
    [dataset.id, exactOrPrefix, trimmed, clampedLimit]
  );
  return result.rows;
}

export async function clearVariantCallsCache(pool: Pool, releaseId: string | number, snpId?: string | null) {
  const dataset = await getLatestGenotypeDataset(pool, releaseId);
  const trimmed = snpId?.trim();
  if (trimmed) {
    const variant = await findVariantBySnpId(pool, dataset.id, trimmed);
    const result = await pool.query("DELETE FROM genotype_variant_calls WHERE variant_id = $1", [variant.id]);
    return {
      dataset,
      variant,
      deleted: result.rowCount ?? 0,
      scope: "variant" as const
    };
  }

  const result = await pool.query(
    `
      DELETE FROM genotype_variant_calls gvc
      USING genotype_variants gv
      WHERE gvc.variant_id = gv.id AND gv.dataset_id = $1
    `,
    [dataset.id]
  );
  return {
    dataset,
    variant: null,
    deleted: result.rowCount ?? 0,
    scope: "dataset" as const
  };
}

export async function ensureVariantCallsCached(pool: Pool, variantId: string | number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [variantId]);

    const variantResult = await client.query<GenotypeVariantRow & GenotypeDatasetRow>(
      `
        SELECT
          gv.*,
          gd.release_id,
          gd.name,
          gd.source_geno_file,
          gd.source_snp_file,
          gd.source_ind_file,
          gd.sample_count,
          gd.variant_count,
          gd.row_bytes,
          gd.header_sample_hash,
          gd.header_variant_hash
        FROM genotype_variants gv
        JOIN genotype_datasets gd ON gd.id = gv.dataset_id
        WHERE gv.id = $1
      `,
      [variantId]
    );
    const variant = variantResult.rows[0];
    if (!variant) throw new Error(`Genotype variant ${variantId} was not found.`);

    const cached = await client.query<{ cached_count: number }>(
      "SELECT count(*)::integer AS cached_count FROM genotype_variant_calls WHERE variant_id = $1",
      [variantId]
    );
    if ((cached.rows[0]?.cached_count ?? 0) === variant.sample_count) {
      await client.query("COMMIT");
      return { variant, inserted: 0, cached: true };
    }

    const samples = await client.query<{ sample_index: number; sample_id: string }>(
      `
        SELECT sample_index, sample_id::text
        FROM genotype_dataset_samples
        WHERE dataset_id = $1
        ORDER BY sample_index ASC
      `,
      [variant.dataset_id]
    );
    if (samples.rowCount !== variant.sample_count) {
      throw new Error(`Genotype dataset sample order has ${samples.rowCount} samples; expected ${variant.sample_count}.`);
    }

    const header = readPackedGenoHeader(variant.source_geno_file);
    if (header.sampleCount !== variant.sample_count || header.variantCount !== variant.variant_count) {
      throw new Error("PACKEDANCESTRYMAP header no longer matches the indexed genotype dataset.");
    }
    if (header.rowBytes !== variant.row_bytes) {
      throw new Error(`PACKEDANCESTRYMAP row size changed from ${variant.row_bytes} to ${header.rowBytes}.`);
    }

    const row = readPackedGenotypeRow(variant.source_geno_file, header, variant.variant_index);
    const calls = decodePackedCallCodes(row, variant.sample_count);

    await client.query("DELETE FROM genotype_variant_calls WHERE variant_id = $1", [variantId]);

    const batchSize = 9000;
    for (let start = 0; start < samples.rows.length; start += batchSize) {
      const batch = samples.rows.slice(start, start + batchSize);
      const params: unknown[] = [];
      const values = batch.map((sample) => {
        const code = calls[sample.sample_index - 1];
        const counts = countsForCallCode(code);
        params.push(variantId, sample.sample_id, code, counts.refCount, counts.altCount, counts.isMissing);
        const offset = params.length - 5;
        return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      });
      await client.query(
        `
          INSERT INTO genotype_variant_calls
            (variant_id, sample_id, call_code, ref_count, alt_count, is_missing)
          VALUES ${values.join(", ")}
        `,
        params
      );
    }

    await client.query("COMMIT");
    return { variant, inserted: samples.rows.length, cached: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function prepareSnpFilters(pool: Pool, releaseId: string | number, filters: SnpFilter[] | undefined | null) {
  const active = (filters ?? []).filter((filter) => filter.snpId?.trim());
  if (!active.length) return [] as PreparedSnpFilter[];

  const dataset = await getLatestGenotypeDataset(pool, releaseId);
  const prepared: PreparedSnpFilter[] = [];
  for (const [index, filter] of active.entries()) {
    const copyStates = normalizeCopyStates(filter.copyStates);
    if (!copyStates.length) continue;
    const variant = await findVariantBySnpId(pool, dataset.id, filter.snpId.trim());
    await ensureVariantCallsCached(pool, variant.id);
    prepared.push({
      ...variant,
      alleleRole: normalizeAlleleRole(filter.alleleRole),
      copyStates,
      countStates: copyStates.filter((state): state is 0 | 1 | 2 => typeof state === "number"),
      includesMissing: copyStates.includes("missing"),
      columnId: snpColumnId(variant.id),
      columnLabel: snpColumnLabel(variant),
      joinAlias: `gvc_snp_${index}`
    });
  }
  return prepared;
}

export async function prepareSnpColumns(
  pool: Pool,
  releaseId: string | number,
  columns: SnpColumnSpec[] | undefined | null,
  filters: PreparedSnpFilter[] = []
) {
  const prepared: PreparedSnpColumn[] = [];
  const seenVariantIds = new Set<string>();

  for (const filter of filters) {
    prepared.push({
      ...filter,
      columnId: filter.columnId,
      columnLabel: filter.columnLabel,
      joinAlias: filter.joinAlias,
      fromFilter: true
    });
    seenVariantIds.add(String(filter.id));
  }

  const active = (columns ?? []).filter((column) => column.snpId?.trim());
  if (!active.length) return prepared;

  const dataset = await getLatestGenotypeDataset(pool, releaseId);
  let displayIndex = 0;
  for (const column of active) {
    const variant = await findVariantBySnpId(pool, dataset.id, column.snpId.trim());
    if (seenVariantIds.has(String(variant.id))) continue;
    await ensureVariantCallsCached(pool, variant.id);
    prepared.push({
      ...variant,
      columnId: snpColumnId(variant.id),
      columnLabel: snpColumnLabel(variant),
      joinAlias: `gvc_snp_col_${displayIndex}`,
      fromFilter: false
    });
    seenVariantIds.add(String(variant.id));
    displayIndex += 1;
  }

  return prepared;
}

export async function prepareSnpColor(
  pool: Pool,
  releaseId: string | number,
  color: SnpColorSpec | null | undefined,
  filters: PreparedSnpFilter[]
) {
  const requested = color?.snpId ? color : filters[0] ? { snpId: filters[0].snp_id, alleleRole: filters[0].alleleRole } : null;
  if (!requested) return null;
  const dataset = await getLatestGenotypeDataset(pool, releaseId);
  const variant = await findVariantBySnpId(pool, dataset.id, requested.snpId.trim());
  await ensureVariantCallsCached(pool, variant.id);
  return {
    ...variant,
    alleleRole: normalizeAlleleRole(requested.alleleRole),
    title: `${variant.snp_id} ${normalizeAlleleRole(requested.alleleRole) === "ref" ? variant.ref_allele ?? "ref" : variant.alt_allele ?? "alt"}`
  } satisfies PreparedSnpColor;
}

export function buildSnpFilterSql(filters: PreparedSnpFilter[], offset: number): SnpSql {
  const joins: string[] = [];
  const where: string[] = [];
  const params: unknown[] = [];

  for (const filter of filters) {
    params.push(filter.id);
    const variantParam = `$${offset + params.length}`;
    joins.push(`JOIN genotype_variant_calls ${filter.joinAlias} ON ${filter.joinAlias}.sample_id = s.id AND ${filter.joinAlias}.variant_id = ${variantParam}`);

    const countColumn = filter.alleleRole === "ref" ? "ref_count" : "alt_count";
    if (filter.countStates.length && filter.includesMissing) {
      params.push(filter.countStates);
      const countParam = `$${offset + params.length}`;
      where.push(`(${filter.joinAlias}.is_missing IS TRUE OR ${filter.joinAlias}.${countColumn} = ANY(${countParam}))`);
    } else if (filter.countStates.length) {
      params.push(filter.countStates);
      const countParam = `$${offset + params.length}`;
      where.push(`(${filter.joinAlias}.is_missing IS FALSE AND ${filter.joinAlias}.${countColumn} = ANY(${countParam}))`);
    } else if (filter.includesMissing) {
      where.push(`${filter.joinAlias}.is_missing IS TRUE`);
    }
  }

  return {
    joins: joins.join("\n"),
    whereText: where.length ? where.join(" AND ") : "TRUE",
    params
  };
}

export function buildSnpColorJoin(color: PreparedSnpColor | null, offset: number) {
  if (!color) return { join: "", params: [] as unknown[], alias: "" };
  return {
    join: `LEFT JOIN genotype_variant_calls gvc_snp_color ON gvc_snp_color.sample_id = s.id AND gvc_snp_color.variant_id = $${offset + 1}`,
    params: [color.id] as unknown[],
    alias: "gvc_snp_color"
  };
}

export function buildSnpColumnJoinSql(columns: PreparedSnpColumn[], offset: number): Pick<SnpSql, "joins" | "params"> {
  const joins: string[] = [];
  const params: unknown[] = [];

  for (const column of columns) {
    if (column.fromFilter) continue;
    params.push(column.id);
    const variantParam = `$${offset + params.length}`;
    joins.push(`LEFT JOIN genotype_variant_calls ${column.joinAlias} ON ${column.joinAlias}.sample_id = s.id AND ${column.joinAlias}.variant_id = ${variantParam}`);
  }

  return {
    joins: joins.join("\n"),
    params
  };
}

export function snpSelectColumns(columns: PreparedSnpColumn[]) {
  return columns.map((column) => `${genotypeLabelSql(column.joinAlias, column)} AS ${sqlIdentifier(column.columnId)}`);
}

export function snpGroupSelectColumns(columns: PreparedSnpColumn[]) {
  return columns.map((column) => {
    const expression = genotypeLabelSql(column.joinAlias, column);
    return `${expression} AS ${sqlIdentifier(column.columnId)}`;
  });
}

export function snpGroupAggregateColumns(columns: PreparedSnpColumn[]) {
  return columns.map((column) => (
    `string_agg(DISTINCT fs.${sqlIdentifier(column.columnId)}, ', ' ORDER BY fs.${sqlIdentifier(column.columnId)}) AS ${sqlIdentifier(column.columnId)}`
  ));
}

export function snpColumnDefinitions(columns: PreparedSnpColumn[]): SnpColumnDefinition[] {
  return columns.map((column) => ({
    id: column.columnId,
    label: column.columnLabel,
    kind: "text",
    sortable: true,
    defaultVisible: true
  }));
}

export function snpSortExpression(fieldId: string, columns: PreparedSnpColumn[], entity: "sample" | "group") {
  const column = columns.find((candidate) => candidate.columnId === fieldId);
  if (!column) return null;
  if (entity === "group") return `g.${sqlIdentifier(column.columnId)}`;
  return `${column.joinAlias}.call_code`;
}
