CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS aadr_releases (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_file TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  header JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS samples (
  id BIGSERIAL PRIMARY KEY,
  release_id BIGINT NOT NULL REFERENCES aadr_releases(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  genetic_id TEXT NOT NULL,
  persistent_genetic_id TEXT,
  individual_id TEXT,
  skeletal_code TEXT,
  skeletal_element TEXT,
  first_publication TEXT,
  publication TEXT,
  doi TEXT,
  repository TEXT,
  date_method TEXT,
  date_mean_bp DOUBLE PRECISION,
  date_sd_bp DOUBLE PRECISION,
  date_mean_year_ce DOUBLE PRECISION,
  full_date TEXT,
  age_morphological TEXT,
  group_id TEXT,
  locality TEXT,
  political_entity TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  pulldown_strategy TEXT,
  suffixes TEXT,
  data_type TEXT,
  no_libraries INTEGER,
  coverage_1150k DOUBLE PRECISION,
  coverage_non_targeted DOUBLE PRECISION,
  snp_2m INTEGER,
  snp_1240k INTEGER,
  snp_ho INTEGER,
  snp_compatibility INTEGER,
  snp_compatibility_ho INTEGER,
  molecular_sex TEXT,
  family_relations TEXT,
  roh_total_20cm_a DOUBLE PRECISION,
  roh_total_20cm_b DOUBLE PRECISION,
  y_hap_terminal TEXT,
  y_hap_isogg TEXT,
  y_hap_manual TEXT,
  mtdna_coverage DOUBLE PRECISION,
  mtdna_haplogroup TEXT,
  mtdna_match_consensus TEXT,
  damage_rate DOUBLE PRECISION,
  sex_ratio DOUBLE PRECISION,
  angsd_mom_ci TEXT,
  hapconx_ci TEXT,
  library_type TEXT,
  libraries TEXT,
  endogenous_by_library TEXT,
  assessment TEXT,
  assessment_warnings TEXT,
  has_coordinates BOOLEAN NOT NULL DEFAULT false,
  geom geometry(Point, 4326),
  UNIQUE (release_id, genetic_id)
);

CREATE TABLE IF NOT EXISTS sample_raw_rows (
  sample_id BIGINT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
  raw_row JSONB NOT NULL,
  raw_line TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admixture_runs (
  id BIGSERIAL PRIMARY KEY,
  release_id BIGINT REFERENCES aadr_releases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  k INTEGER NOT NULL CHECK (k > 0),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, name, k)
);

CREATE TABLE IF NOT EXISTS admixture_components (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES admixture_runs(id) ON DELETE CASCADE,
  component_index INTEGER NOT NULL CHECK (component_index >= 1),
  color_hex TEXT NOT NULL,
  label TEXT,
  UNIQUE (run_id, component_index)
);

CREATE TABLE IF NOT EXISTS admixture_values (
  run_id BIGINT NOT NULL REFERENCES admixture_runs(id) ON DELETE CASCADE,
  sample_id BIGINT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  component_index INTEGER NOT NULL CHECK (component_index >= 1),
  fraction DOUBLE PRECISION NOT NULL CHECK (fraction >= 0 AND fraction <= 1),
  PRIMARY KEY (run_id, sample_id, component_index)
);

CREATE INDEX IF NOT EXISTS samples_release_idx ON samples (release_id);
CREATE INDEX IF NOT EXISTS samples_genetic_id_idx ON samples (genetic_id);
CREATE INDEX IF NOT EXISTS samples_group_id_idx ON samples (group_id);
CREATE INDEX IF NOT EXISTS samples_political_entity_idx ON samples (political_entity);
CREATE INDEX IF NOT EXISTS samples_locality_idx ON samples (locality);
CREATE INDEX IF NOT EXISTS samples_date_mean_bp_idx ON samples (date_mean_bp);
CREATE INDEX IF NOT EXISTS samples_date_mean_year_ce_idx ON samples (date_mean_year_ce);
CREATE INDEX IF NOT EXISTS samples_snp_1240k_idx ON samples (snp_1240k);
CREATE INDEX IF NOT EXISTS samples_assessment_idx ON samples (assessment);
CREATE INDEX IF NOT EXISTS samples_has_coordinates_idx ON samples (has_coordinates);
CREATE INDEX IF NOT EXISTS samples_geom_gist_idx ON samples USING GIST (geom);
CREATE INDEX IF NOT EXISTS admixture_values_sample_idx ON admixture_values (sample_id);
CREATE INDEX IF NOT EXISTS admixture_values_run_component_idx ON admixture_values (run_id, component_index);

CREATE MATERIALIZED VIEW IF NOT EXISTS sample_map_points AS
SELECT
  s.id AS sample_id,
  s.release_id,
  s.row_number,
  s.genetic_id,
  s.group_id,
  s.locality,
  s.political_entity,
  s.date_mean_year_ce,
  s.snp_1240k,
  s.molecular_sex,
  s.y_hap_isogg,
  s.y_hap_terminal,
  s.mtdna_haplogroup,
  s.data_type,
  s.assessment,
  s.has_coordinates,
  s.latitude,
  s.longitude,
  s.geom,
  CASE
    WHEN s.geom IS NOT NULL THEN ST_Transform(s.geom, 3857)::geometry(Point, 3857)
    ELSE NULL
  END AS geom_webmercator,
  CASE
    WHEN s.has_coordinates AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
    THEN concat(round(s.latitude::numeric, 6), ',', round(s.longitude::numeric, 6))
    ELSE NULL
  END AS coordinate_key
FROM samples s;

CREATE UNIQUE INDEX IF NOT EXISTS sample_map_points_sample_id_idx ON sample_map_points (sample_id);
CREATE INDEX IF NOT EXISTS sample_map_points_release_idx ON sample_map_points (release_id);
CREATE INDEX IF NOT EXISTS sample_map_points_group_idx ON sample_map_points (release_id, group_id);
CREATE INDEX IF NOT EXISTS sample_map_points_coordinate_key_idx ON sample_map_points (release_id, coordinate_key);
CREATE INDEX IF NOT EXISTS sample_map_points_geom_gist_idx ON sample_map_points USING GIST (geom);
CREATE INDEX IF NOT EXISTS sample_map_points_webmercator_gist_idx ON sample_map_points USING GIST (geom_webmercator);

CREATE TABLE IF NOT EXISTS sample_map_cache (
  sample_id BIGINT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
  release_id BIGINT NOT NULL REFERENCES aadr_releases(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  genetic_id TEXT,
  group_id TEXT,
  group_site_key TEXT,
  locality TEXT,
  political_entity TEXT,
  date_mean_bp DOUBLE PRECISION,
  date_mean_year_ce DOUBLE PRECISION,
  coverage_1150k DOUBLE PRECISION,
  snp_2m INTEGER,
  snp_1240k INTEGER,
  molecular_sex TEXT,
  y_hap_isogg TEXT,
  y_hap_terminal TEXT,
  mtdna_haplogroup TEXT,
  data_type TEXT,
  assessment TEXT,
  has_coordinates BOOLEAN NOT NULL DEFAULT false,
  coordinate_status TEXT NOT NULL CHECK (coordinate_status IN ('ok', 'missing', 'issue')),
  coordinate_issue_reason TEXT,
  suggested_latitude DOUBLE PRECISION,
  suggested_longitude DOUBLE PRECISION,
  original_latitude DOUBLE PRECISION,
  original_longitude DOUBLE PRECISION,
  display_latitude DOUBLE PRECISION,
  display_longitude DOUBLE PRECISION,
  display_geom geometry(Point, 4326),
  display_geom_webmercator geometry(Point, 3857),
  site_cluster_id TEXT,
  is_spatial_outlier BOOLEAN NOT NULL DEFAULT false,
  outlier_target_latitude DOUBLE PRECISION,
  outlier_target_longitude DOUBLE PRECISION,
  single_label TEXT NOT NULL,
  single_color_light TEXT NOT NULL,
  single_color_dark TEXT NOT NULL,
  sex_label TEXT NOT NULL,
  sex_color_light TEXT NOT NULL,
  sex_color_dark TEXT NOT NULL,
  data_type_label TEXT NOT NULL,
  data_type_color_light TEXT NOT NULL,
  data_type_color_dark TEXT NOT NULL,
  group_cluster_label TEXT NOT NULL,
  group_cluster_color_light TEXT NOT NULL,
  group_cluster_color_dark TEXT NOT NULL,
  y_haplogroup_initial_label TEXT NOT NULL,
  y_haplogroup_initial_color_light TEXT NOT NULL,
  y_haplogroup_initial_color_dark TEXT NOT NULL,
  mtdna_initial_label TEXT NOT NULL,
  mtdna_initial_color_light TEXT NOT NULL,
  mtdna_initial_color_dark TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_sort INTEGER NOT NULL DEFAULT 999,
  period_color_light TEXT NOT NULL,
  period_color_dark TEXT NOT NULL,
  gradient_snp_1240k_value DOUBLE PRECISION,
  gradient_snp_1240k_color_light TEXT NOT NULL,
  gradient_snp_1240k_color_dark TEXT NOT NULL,
  gradient_snp_2m_value DOUBLE PRECISION,
  gradient_snp_2m_color_light TEXT NOT NULL,
  gradient_snp_2m_color_dark TEXT NOT NULL,
  gradient_coverage_1150k_value DOUBLE PRECISION,
  gradient_coverage_1150k_color_light TEXT NOT NULL,
  gradient_coverage_1150k_color_dark TEXT NOT NULL,
  gradient_date_mean_bp_value DOUBLE PRECISION,
  gradient_date_mean_bp_color_light TEXT NOT NULL,
  gradient_date_mean_bp_color_dark TEXT NOT NULL,
  gradient_smart_date_mean_bp_value DOUBLE PRECISION,
  gradient_smart_date_mean_bp_color_light TEXT NOT NULL,
  gradient_smart_date_mean_bp_color_dark TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sample_map_cache_release_idx ON sample_map_cache (release_id);
CREATE INDEX IF NOT EXISTS sample_map_cache_status_idx ON sample_map_cache (release_id, coordinate_status);
CREATE INDEX IF NOT EXISTS sample_map_cache_group_idx ON sample_map_cache (release_id, group_id, group_site_key);
CREATE INDEX IF NOT EXISTS sample_map_cache_display_geom_gist_idx ON sample_map_cache USING GIST (display_geom);
CREATE INDEX IF NOT EXISTS sample_map_cache_display_webmercator_gist_idx ON sample_map_cache USING GIST (display_geom_webmercator);

CREATE TABLE IF NOT EXISTS group_map_cache (
  group_site_key TEXT NOT NULL,
  release_id BIGINT NOT NULL REFERENCES aadr_releases(id) ON DELETE CASCADE,
  group_id TEXT,
  site_cluster_id TEXT NOT NULL,
  full_sample_count INTEGER NOT NULL DEFAULT 0,
  centroid_latitude DOUBLE PRECISION NOT NULL,
  centroid_longitude DOUBLE PRECISION NOT NULL,
  display_latitude DOUBLE PRECISION NOT NULL,
  display_longitude DOUBLE PRECISION NOT NULL,
  display_geom geometry(Point, 4326),
  display_geom_webmercator geometry(Point, 3857),
  is_spatial_outlier BOOLEAN NOT NULL DEFAULT false,
  outlier_target_latitude DOUBLE PRECISION,
  outlier_target_longitude DOUBLE PRECISION,
  single_label TEXT NOT NULL,
  single_color_light TEXT NOT NULL,
  single_color_dark TEXT NOT NULL,
  sex_label TEXT NOT NULL,
  sex_color_light TEXT NOT NULL,
  sex_color_dark TEXT NOT NULL,
  data_type_label TEXT NOT NULL,
  data_type_color_light TEXT NOT NULL,
  data_type_color_dark TEXT NOT NULL,
  group_cluster_label TEXT NOT NULL,
  group_cluster_color_light TEXT NOT NULL,
  group_cluster_color_dark TEXT NOT NULL,
  y_haplogroup_initial_label TEXT NOT NULL,
  y_haplogroup_initial_color_light TEXT NOT NULL,
  y_haplogroup_initial_color_dark TEXT NOT NULL,
  mtdna_initial_label TEXT NOT NULL,
  mtdna_initial_color_light TEXT NOT NULL,
  mtdna_initial_color_dark TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_sort INTEGER NOT NULL DEFAULT 999,
  period_color_light TEXT NOT NULL,
  period_color_dark TEXT NOT NULL,
  gradient_snp_1240k_value DOUBLE PRECISION,
  gradient_snp_1240k_color_light TEXT NOT NULL,
  gradient_snp_1240k_color_dark TEXT NOT NULL,
  gradient_snp_2m_value DOUBLE PRECISION,
  gradient_snp_2m_color_light TEXT NOT NULL,
  gradient_snp_2m_color_dark TEXT NOT NULL,
  gradient_coverage_1150k_value DOUBLE PRECISION,
  gradient_coverage_1150k_color_light TEXT NOT NULL,
  gradient_coverage_1150k_color_dark TEXT NOT NULL,
  gradient_date_mean_bp_value DOUBLE PRECISION,
  gradient_date_mean_bp_color_light TEXT NOT NULL,
  gradient_date_mean_bp_color_dark TEXT NOT NULL,
  gradient_smart_date_mean_bp_value DOUBLE PRECISION,
  gradient_smart_date_mean_bp_color_light TEXT NOT NULL,
  gradient_smart_date_mean_bp_color_dark TEXT NOT NULL,
  PRIMARY KEY (release_id, group_site_key)
);

CREATE INDEX IF NOT EXISTS group_map_cache_release_idx ON group_map_cache (release_id);
CREATE INDEX IF NOT EXISTS group_map_cache_group_idx ON group_map_cache (release_id, group_id);
CREATE INDEX IF NOT EXISTS group_map_cache_display_geom_gist_idx ON group_map_cache USING GIST (display_geom);
CREATE INDEX IF NOT EXISTS group_map_cache_display_webmercator_gist_idx ON group_map_cache USING GIST (display_geom_webmercator);

ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS group_cluster_label TEXT NOT NULL DEFAULT 'No group ID';
ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS group_cluster_color_light TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS group_cluster_color_dark TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_value DOUBLE PRECISION;
ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_color_light TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE sample_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_color_dark TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS group_cluster_label TEXT NOT NULL DEFAULT 'No group ID';
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS group_cluster_color_light TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS group_cluster_color_dark TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_value DOUBLE PRECISION;
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_color_light TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE group_map_cache ADD COLUMN IF NOT EXISTS gradient_smart_date_mean_bp_color_dark TEXT NOT NULL DEFAULT '#000000';

CREATE TABLE IF NOT EXISTS map_legend_cache (
  id BIGSERIAL PRIMARY KEY,
  release_id BIGINT NOT NULL REFERENCES aadr_releases(id) ON DELETE CASCADE,
  color_mode TEXT NOT NULL CHECK (color_mode IN ('fixed', 'gradient')),
  color_field TEXT NOT NULL,
  theme TEXT NOT NULL CHECK (theme IN ('light', 'dark')),
  legend_kind TEXT NOT NULL CHECK (legend_kind IN ('categorical', 'gradient')),
  label TEXT NOT NULL,
  color TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  stops JSONB,
  ticks JSONB,
  segments JSONB,
  unknown_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE map_legend_cache ADD COLUMN IF NOT EXISTS segments JSONB;

CREATE INDEX IF NOT EXISTS map_legend_cache_lookup_idx ON map_legend_cache (release_id, color_mode, color_field, theme, sort_order);
