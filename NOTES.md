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
- Categorical `Period` colors prioritize visual separation over strict within-era shade continuity. Paleolithic stays dark blue, Mesolithic uses light blues, Bronze Age uses a red-family spectrum, and the other periods use divergent green/yellow/brown/slate/teal/purple/green colors.
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

## SNP Genotype Lookup

- AADR PACKEDANCESTRYMAP `.geno/.snp/.ind` files are the read-only genotype authority. The app does not use PLINK in the runtime path and does not copy the full genotype matrix into PostgreSQL.
- PostgreSQL stores genotype dataset metadata, `.ind` sample order mapped to `samples.id`, searchable `.snp` variant metadata, and cached per-sample calls only for SNPs users query.
- First use of an indexed SNP decodes one packed `.geno` row and caches calls in `genotype_variant_calls`; `npm run genotypes:cache -- --snp <rsid>` can prewarm known SNPs for demos.
- Normal metadata table/map queries do not touch genotype tables. SNP joins are added only when `snpFilters` or SNP map coloring is active.
- SNP table columns are dynamic and sortable only for active SNP filters returned by the server. The server resolves each requested SNP against indexed metadata before using a generated SQL expression.
- Map SNP coloring is applied at query/render time from cached calls. `sample_map_cache` and `group_map_cache` are not rebuilt for genotype state.
- SNP map palettes are request/profile settings, not cached map data. Each palette colors selected-allele genotype states with one hue family: 2 copies darkest, 1 copy lighter, and 0 copies lightest; missing calls remain black.
