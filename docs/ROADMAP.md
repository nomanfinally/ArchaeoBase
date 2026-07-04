# ArchaeoBase Roadmap

## Phase 0 - Documentation And Scaffold

- [x] Create `AGENTS.md`.
- [x] Create `docs/ROADMAP.md`.
- [x] Scaffold root Next.js + TypeScript app.
- [x] Add local PostgreSQL/PostGIS dev setup.
- [x] Add `.env.example` with `DATABASE_URL` and `AADR_ANNO_PATH`.

## Phase 1 - AADR Import And Sample Table

- [x] Parse the 49-column AADR TSV.
- [x] Normalize `..` and empty values to `null`.
- [x] Preserve original headers in metadata.
- [x] Handle duplicate ROH columns with distinct internal names.
- [x] Add PostgreSQL schema for releases, samples, raw rows, and ADMIXTURE tables.
- [x] Add migration and import scripts.
- [x] Add compact academic table UI.
- [x] Add global search, column visibility, sorting, and advanced AND/OR filters.
- [x] Use server-side querying plus TanStack Virtual.

## Phase 2 - Unique Group ID Mode

- [x] Add `Samples | Groups` granularity toggle.
- [x] Aggregate filtered samples by `group_id`.
- [x] Expose group date range, country/locality summaries, SNP summaries, sample count, weighted centroid, and multi-site flag.
- [ ] Add expandable group rows showing member samples.

## Phase 3 - ADMIXTURE Table Integration

- [x] Add schema for ADMIXTURE runs, components, and long-format values.
- [x] Add API endpoint for available runs.
- [x] Add table rendering support for ADMIXTURE stacked bars when values are present.
- [ ] Implement concrete ADMIXTURE import adapters after real file examples are provided.
- [ ] Require explicit sample ID mapping for every ADMIXTURE import.
- [ ] Add UI for selecting ADMIXTURE run/K.

## Phase 4 - Map Views

- [ ] Add MapLibre map view using the same filter state.
- [ ] Add sample map with point markers.
- [ ] Add group map with weighted centroids.
- [ ] Add PostGIS bounding-box querying.
- [ ] Add ADMIXTURE pie markers with marker-count simplification.

## Phase 5 - Research Workflow Polish

- [ ] Persist shareable view state in the URL.
- [ ] Add saved views in PostgreSQL.
- [ ] Export filtered samples/groups.
- [ ] Copy genetic IDs and group IDs.
- [ ] Add row detail drawer with publication, repository, QC, and ADMIXTURE details.
- [ ] Deploy against managed PostgreSQL.

## Acceptance Checklist

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run db:migrate` creates the schema.
- [ ] `npm run import:aadr -- --file v66.2M.aadr.PUB.anno --release v66.2M.aadr.PUB --replace` imports the current anno file.
- [ ] The table can filter samples and groups with nested AND/OR filters.

