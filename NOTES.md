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
- `Age BP` is the ordinary continuous age scale and should remain available unchanged.
- `Age BP (split)` is a separate cached spectrum. It uses four meaningful horizontal segments: Paleolithic-Mesolithic, Neolithic-Chalcolithic, Bronze Age, and Iron Age-Modern. The normal `Age BP` gradient remains unchanged.
- Bronze Age now has EBA, MBA, MLBA, and LBA period labels for sample metadata, but the split-age spectrum keeps Bronze Age as one purple-to-red bar with small outside subperiod labels.
- Population-cluster marker colors normalize known AADR suffix tokens such as `.AG`, `.TW`, and `.AG.TW` before assigning colors, so suffix-only data-type variants of the same group receive the same cached population color.
- `Age BP (split)` is intentionally not a calibrated-width numeric scale in the legend. The four macro segments are equal width so labels remain readable; tick marks inside each segment show which period/subperiod belongs to that color range.
- Population-cluster styling uses a capped palette of 12 colors. The cache still assigns nearby groups divergent colors when possible, but the legend is aggregated by color class instead of listing every group ID.

## Regions And View State

- `samples.regions` is a derived research column, not source AADR data. It is populated from `data/political_entity_regions.csv` by `npm run db:regions` and during AADR import.
- Region categories are `Africa`, `Asia`, `Europe`, `North America`, `South America`, `Oceania`, and `Unknown`. The mapping follows UNSD M49 regions/subregions where possible; Americas are split into North America and South America for explorer filtering.
- The mapping CSV is intentionally tracked even though the rest of `data/` is ignored, because import and backfill scripts depend on it.
- The explorer keeps active view state in browser local storage and profile YAML. The time-window display mode (`BCE/CE` or `BP`) is persisted with the rest of the view so reopening the period panel preserves the user's mode.
