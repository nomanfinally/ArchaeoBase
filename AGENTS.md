# Agent Rules

This project is a web-based ancient DNA metadata explorer for AADR `.anno` data and later ADMIXTURE outputs.

1. Treat raw input datasets as read-only. Do not edit, normalize in place, move, or overwrite `.anno`, ADMIXTURE `.Q`, ID/order files, genotype files, or other source data.
2. Use PostgreSQL/PostGIS as the primary data path. DuckDB-WASM may be added later only as a read-only export path.
3. Keep parsing, data import, filter compilation, SQL querying, and UI rendering in separate modules.
4. Declare every filterable/sortable field in the central field registry before exposing it in UI or API.
5. Compile filters only through whitelisted registry fields and parameterized SQL. Never concatenate user-provided field names, operators, sort keys, or values directly into SQL.
6. Group mode means: filter individual samples first, then aggregate matching samples by `group_id`.
7. ADMIXTURE component identity is scoped by `run_id + k + component_index`. Do not assume component identity is stable across runs.
8. Keep the UI compact, academic, and low-color. Avoid decorative dashboards, marketing pages, and large hero sections.
9. Use table virtualization for large result sets. Do not render all AADR rows into the DOM.
10. Preserve long original AADR headers as metadata/tooltips where useful, but use short internal field names in code and SQL.
11. Keep map view and table view as renderers over the same query/filter state.
12. Run `npm test` and `npm run build` after implementation changes whenever dependencies are installed.
13. Use clear, professional, compact UI labels. Avoid joke, filler, or awkward control names; choose concise academic wording for user-facing text.
