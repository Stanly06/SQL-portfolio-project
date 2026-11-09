-- =====================================================================
-- 00_schemas.sql
-- Arquitectura "Medallion" (Bronze / Silver / Gold), la misma idea que se
-- usa en Databricks, Snowflake, dbt, etc.
--   raw     (bronze) : datos tal cual llegan de los sistemas fuente (sucios)
--   staging (silver) : datos limpios, tipados y deduplicados
--   dw      (gold)   : modelo dimensional (estrella) para BI
--   analytics        : vistas / consultas de negocio
--   audit            : control de cargas (watermarks) y calidad de datos
-- =====================================================================
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS raw, staging, dw, analytics, audit CASCADE;

CREATE SCHEMA raw;
CREATE SCHEMA staging;
CREATE SCHEMA dw;
CREATE SCHEMA analytics;
CREATE SCHEMA audit;

-- Tabla de control para cargas incrementales (patrón "high-water mark")
CREATE TABLE audit.etl_watermark (
    table_name      TEXT PRIMARY KEY,
    last_loaded_at  TIMESTAMP NOT NULL DEFAULT '1900-01-01',
    rows_loaded     BIGINT    NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- Log de ejecuciones del pipeline
CREATE TABLE audit.etl_run_log (
    run_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    step_name     TEXT      NOT NULL,
    rows_affected BIGINT,
    started_at    TIMESTAMP NOT NULL DEFAULT clock_timestamp(),
    status        TEXT      NOT NULL DEFAULT 'OK'
);
