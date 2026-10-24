# Project Notes

## Map Cache And Stable Marker Rendering

- Map marker positions are cached in PostgreSQL/PostGIS so pan and zoom remain camera-only operations. This prevents marker locations and colors from changing while a user is trying to inspect or click samples.
- Sample splitting is calibrated through `npm run db:tune-map` instead of source edits. Use presets (`tight`, `balanced`, `wide`) or explicit flags such as `--offset-scale`, `--sample-spacing-px`, and `--max-sample-offset-m`.
- Current balanced layout intentionally keeps sample splitting moderate: enough to separate dense same-site samples at useful zoom, but not so much that low-zoom maps look geographically misleading.
- Centroid markers are visual anchors for common `group_id`/group-site clusters with more than one sample. They are rendered as small solid `x` symbols at the unsplit cached group/site centroid, not as dots and not as popup targets.
- Centroid colors use the cached `Population cluster` color, independent of the active marker color mode. This makes the centroid a stable group anchor while sample dots can still be colored by sex, period, SNPs, or other criteria.

## Marker Color Semantics

- Haplogroup non-data states are distinct categories, not collapsed into a single `Unknown`. Examples include `No Y-DNA (female)`, `Y-DNA n/a (sex unknown)`, and `mtDNA n/a (<2x)`.
- Popups should show Y-DNA and mtDNA rows even when values are unavailable. The value should be explicit, such as `n/a (female)` or `n/a (<2x)`, so absence of data is not confused with omission by the UI.
- Table cells render unavailable values such as `n/a (female)`, `n/a (<2x)`, `unknown`, and `not reported` as pale italic text. This is display-only styling and does not change query, filter, or export values.
- `Age BP` is the ordinary continuous age scale. Its legend runs oldest-to-youngest from left to right, keeps Paleolithic/Mesolithic values in dark-to-light blue, and uses extra Bronze Age anchors so dense Bronze Age samples receive more color separation.
- `Age BP (split)` is a separate cached spectrum. It uses four meaningful horizontal segments: Paleolithic-Mesolithic, Neolithic-Chalcolithic, Bronze Age, and Iron Age-Modern.
- Bronze Age now has EBA, MBA, MLBA, and LBA period labels for sample metadata, but the split-age spectrum keeps Bronze Age as one purple-to-red bar with small outside subperiod labels.
- Categorical `Period` colors use distinct hue families by broad era, then separated shades within subperiods: Paleolithic indigo, Mesolithic blue, Neolithic green/olive, Chalcolithic orange, Bronze Age rose-red, Iron Age slate, Classical teal, Medieval magenta, and Modern gold. Dark-theme shades intentionally avoid near-white fills so marker strokes remain distinguishable.
- Population-cluster marker colors normalize known AADR suffix tokens such as `.AG`, `.TW`, and `.AG.TW` before assigning colors, so suffix-only data-type variants of the same group receive the same cached population color.
- `Age BP (split)` is intentionally not a calibrated-width numeric scale in the legend. The four macro segments are equal width so labels remain readable; tick marks inside each segment show which period/subperiod belongs to that color range.
- Population-cluster styling uses a capped palette of 12 colors. The cache still assigns nearby groups divergent colors when possible, but the legend is aggregated by color class instead of listing every group ID.
- Absent Y-DNA and mtDNA states use only black/grey shades. Labels can still distinguish female, low coverage, unknown, and not reported states, but absence itself should not be encoded with bright sex or haplogroup colors.
- Map legend fading is a user setting. Full-map mode is transient UI state and is not saved to profiles.
- Modern map markers render as rounded triangles via one shared MapLibre SDF icon layer. Other periods remain circle-layer markers; this avoids per-marker DOM/SVG work and keeps hover/click handling on the same GeoJSON source.

## Regions And View State

- `samples.regions` is a derived research column, not source AADR data. It is populated from `data/political_entity_regions.csv` by `npm run db:regions` and during AADR import.
- Region categories are `Africa`, `Asia`, `Europe`, `North America`, `South America`, `Oceania`, and `Unknown`. The mapping follows UNSD M49 regions/subregions where possible; Americas are split into North America and South America for explorer filtering.
- The mapping CSV is intentionally tracked even though the rest of `data/` is ignored, because import and backfill scripts depend on it.
- The explorer keeps active view state in browser local storage and profile YAML. The time-window display mode (`BCE/CE` or `BP`) is persisted with the rest of the view so reopening the period panel preserves the user's mode.

## CSV Export

- The `Unique group IDs` CSV mode is aggregated from the currently matching sample rows, not from the Group Table response. Text fields such as genetic IDs, haplogroups, period names, countries, molecular sex, localities, suffixes, publications, and DOIs are combined with commas; coordinate and date outlier segments are separated with semicolons; SNP counts are averaged.

## Development Server

- `npm run dev` uses webpack with `WATCHPACK_POLLING=true` because the project lives under a large Syncthing tree where native Turbopack/Watchpack file watching can hit `EMFILE: too many open files`. Polling keeps local development reliable without changing production builds.

## SNP Genotype Lookup

- AADR PACKEDANCESTRYMAP `.geno/.snp/.ind` files are the read-only genotype authority. The app does not use PLINK in the runtime path and does not copy the full genotype matrix into PostgreSQL.
- PostgreSQL stores genotype dataset metadata, `.ind` sample order mapped to `samples.id`, searchable `.snp` variant metadata, and cached per-sample calls only for SNPs users query.
- Multiple genotype datasets can be indexed for one AADR release. `genotype_datasets.is_active` records the selected `.geno/.snp/.ind` set, and runtime SNP lookup prefers the active dataset before falling back to the newest import.
- First use of an indexed SNP decodes one packed `.geno` row and caches calls in `genotype_variant_calls`; `npm run genotypes:cache -- --snp <rsid>` can prewarm known SNPs for demos.
- Normal metadata table/map queries do not touch genotype tables. SNP joins are added only when `snpFilters` or SNP map coloring is active.
- SNP table columns are dynamic and sortable only for server-resolved SNP filters or display-only SNP genotype columns. Adding a SNP filter also pins the same SNP as a display column, while Properties can add SNP genotype columns without filtering rows.
- Map SNP coloring is applied at query/render time from cached calls. `sample_map_cache` and `group_map_cache` are not rebuilt for genotype state.
- SNP map palettes are request/profile settings, not cached map data. Each palette colors selected-allele genotype states with one hue family: 2 copies darkest, 1 copy lighter, and 0 copies lightest; missing calls remain black.

## G25 Coordinates

- G25 coordinate sheets are read-only sources. Import them with `npm run import:g25 -- --file imports/g25.csv --replace`; the importer writes linked rows to `g25_coordinates` and does not edit the source CSV.
- Headerless G25 rows are interpreted as `coords_name,coord_1,...,coord_25`. Headered CSVs may include `coords_name`, `genetic_id`, and `source`; if `genetic_id` is absent, it is inferred from the coordinate name segment after `:` and before `__`.
- Table properties expose hidden-by-default `G25 Coordinates` as one full `name,coord_1,...,coord_25` value, plus optional source/name metadata for ordinary row exports. Split coordinate columns remain internal for group averaging and are not exposed in the UI. Missing imported coordinates still receive a fallback name built from `group_id:genetic_id`, with 25 empty coordinate slots.
- Group table/export mode computes per-PC G25 averages from the currently matching sample rows, ignoring missing coordinate values rather than treating them as zero. Group G25 coordinate lines always use `group_id` as the name/info prefix, so the exported value is `GroupID,avg1,...,avg25` and never inherits individual sample coordinate names. Averages are rounded to six decimal places to match ordinary G25 coordinate precision.
- The dedicated G25 export mode exposes only `G25 Coordinates` and `G25 Source`; sample name/info is part of the full G25 coordinate value. The full G25 line is quoted so commas remain inside the cell. Normal row exports can include G25 columns alongside any other selected metadata and retain CSV headers.

## Maintenance CLI

- `npm run ab -- ...` is the project maintenance entrypoint for database tasks. It wraps the existing importers for AADR `.anno`, G25 coordinates, genotype indexes, ADMIXTURE runs, region backfill, map cache rebuild/tuning, and migrations.
- Period range definitions live in tracked `data/period_definitions.json` instead of source code. Use `npm run ab -- periods export/import/show` to review or update them, then rebuild the map cache so cached period labels/colors match the new ranges.
- Use `npm run ab -- genotypes list` and `npm run ab -- genotypes use --id <dataset_id>` to select among indexed `.geno/.snp/.ind` datasets without reimporting source metadata.
