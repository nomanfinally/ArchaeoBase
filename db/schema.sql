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
