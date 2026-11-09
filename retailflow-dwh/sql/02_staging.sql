-- =====================================================================
-- 02_staging.sql  (capa SILVER)
-- Limpieza, tipado y DEDUPLICACIÓN.
-- Técnicas clave de entrevista:
--   * ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) para deduplicar
--   * NULLIF / COALESCE / TRIM / LOWER / INITCAP para normalizar
--   * CAST seguro de TEXT -> DATE/NUMERIC
--   * CREATE TABLE AS (CTAS)
-- =====================================================================
SET client_min_messages = warning;
DROP TABLE IF EXISTS staging.customers_history, staging.products, staging.categories,
                     staging.orders, staging.order_items, staging.web_events;

-- ---------------------------------------------------------------------
-- Clientes: guardamos TODAS las versiones (para SCD2), pero sin duplicados
-- exactos. Un duplicado = mismo customer_id + mismo updated_at.
-- ---------------------------------------------------------------------
CREATE TABLE staging.customers_history AS
WITH cleaned AS (
    SELECT
        customer_id,
        INITCAP(TRIM(full_name))                         AS full_name,
        LOWER(TRIM(email))                               AS email,
        TRIM(city)                                       AS city,
        TRIM(country)                                    AS country,
        COALESCE(NULLIF(TRIM(segment), ''), 'Unknown')   AS segment,   -- '' -> NULL -> 'Unknown'
        signup_date::date                                AS signup_date,
        updated_at::timestamp                            AS valid_from,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id, updated_at
            ORDER BY _ingested_at DESC                    -- nos quedamos con la ingesta más reciente
        ) AS rn
    FROM raw.customers
    WHERE customer_id IS NOT NULL
)
SELECT customer_id, full_name, email, city, country, segment, signup_date, valid_from
FROM cleaned
WHERE rn = 1;

-- ---------------------------------------------------------------------
-- Categorías y productos
-- ---------------------------------------------------------------------
CREATE TABLE staging.categories AS
SELECT category_id, TRIM(category_name) AS category_name, parent_category_id
FROM raw.categories;

CREATE TABLE staging.products AS
SELECT product_id,
       product_name,
       category_id,
       unit_price::numeric(12,2) AS list_price,
       unit_cost::numeric(12,2)  AS unit_cost,
       (is_active = 'Y')         AS is_active
FROM raw.products;

-- ---------------------------------------------------------------------
-- Órdenes: dedup por order_id + normalización de status/canal
-- ---------------------------------------------------------------------
CREATE TABLE staging.orders AS
SELECT order_id, customer_id, order_ts, status, channel, _ingested_at
FROM (
    SELECT
        order_id,
        customer_id,
        order_ts::timestamp                    AS order_ts,
        LOWER(TRIM(status))                    AS status,      -- 'RETURNED' -> 'returned'
        COALESCE(channel, 'unknown')           AS channel,
        _ingested_at,
        ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY _ingested_at DESC) AS rn
    FROM raw.orders
) t
WHERE rn = 1;

ALTER TABLE staging.orders ADD PRIMARY KEY (order_id);

-- ---------------------------------------------------------------------
-- Líneas de orden: cast seguro y cálculo de montos
-- ---------------------------------------------------------------------
CREATE TABLE staging.order_items AS
SELECT
    order_id,
    line_no,
    product_id,
    quantity::int                                               AS quantity,
    unit_price::numeric(12,2)                                   AS unit_price,
    COALESCE(NULLIF(discount, '')::numeric(5,2), 0)             AS discount_pct,
    round(quantity::int * unit_price::numeric * (1 - COALESCE(NULLIF(discount, '')::numeric, 0)), 2) AS net_amount
FROM raw.order_items;

ALTER TABLE staging.order_items ADD PRIMARY KEY (order_id, line_no);

-- ---------------------------------------------------------------------
-- Eventos web: "aplanar" JSONB a columnas (operadores ->, ->>, #>>)
-- ---------------------------------------------------------------------
CREATE TABLE staging.web_events AS
SELECT
    event_id,
    payload->>'customer_id'               AS customer_id,
    payload->>'event_type'                AS event_type,
    (payload->>'event_ts')::timestamp     AS event_ts,
    payload #>> '{device,type}'           AS device_type,
    payload->'device'->>'os'              AS device_os
FROM raw.web_events;

INSERT INTO audit.etl_run_log(step_name, rows_affected)
SELECT 'staging', (SELECT count(*) FROM staging.orders);
