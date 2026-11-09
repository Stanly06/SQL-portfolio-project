-- =====================================================================
-- 08_performance.sql
-- Optimización: EXPLAIN ANALYZE, índices, vistas materializadas y
-- particionamiento declarativo.
-- =====================================================================
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1) Leer un plan de ejecución
--    Busca: Seq Scan vs Index Scan, tipo de join (Hash/Merge/Nested Loop),
--    filas estimadas vs reales, y "actual time".
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS dw.ix_fact_sales_order_ts;   -- para que el "antes" sea reproducible

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT f.order_id, f.net_amount
FROM dw.fact_sales f
WHERE f.order_ts >= '2024-12-01' AND f.order_ts < '2024-12-02';

-- Sin índice en order_ts -> Seq Scan. Creamos índice y comparamos:
CREATE INDEX IF NOT EXISTS ix_fact_sales_order_ts ON dw.fact_sales (order_ts);
ANALYZE dw.fact_sales;

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT f.order_id, f.net_amount
FROM dw.fact_sales f
WHERE f.order_ts >= '2024-12-01' AND f.order_ts < '2024-12-02';

-- Índice cubriente (INCLUDE): permite "Index Only Scan" sin tocar la tabla
CREATE INDEX IF NOT EXISTS ix_fact_sales_cust_cover
    ON dw.fact_sales (customer_sk, order_ts) INCLUDE (net_amount);

-- Índice parcial: solo las filas que generan ingreso (las más consultadas)
CREATE INDEX IF NOT EXISTS ix_fact_sales_revenue
    ON dw.fact_sales (date_key) WHERE is_revenue;

-- ---------------------------------------------------------------------
-- 2) Vista materializada: agregado diario precalculado para dashboards
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_daily_sales;
CREATE MATERIALIZED VIEW analytics.mv_daily_sales AS
SELECT d.full_date,
       p.category_id,
       f.channel,
       count(DISTINCT f.order_id) AS orders,
       sum(f.quantity)            AS units,
       sum(f.net_amount)          AS revenue,
       sum(f.gross_profit)        AS gross_profit
FROM dw.fact_sales f
JOIN dw.dim_date d    ON d.date_key = f.date_key
JOIN dw.dim_product p ON p.product_sk = f.product_sk
WHERE f.is_revenue
GROUP BY d.full_date, p.category_id, f.channel;

-- índice único -> permite REFRESH ... CONCURRENTLY (sin bloquear lecturas)
CREATE UNIQUE INDEX ux_mv_daily_sales ON analytics.mv_daily_sales (full_date, category_id, channel);
REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_daily_sales;

-- ---------------------------------------------------------------------
-- 3) Particionamiento por rango de fecha (tablas de hechos grandes)
--    El planner descarta particiones que no aplican = "partition pruning".
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS dw.fact_sales_partitioned;
CREATE TABLE dw.fact_sales_partitioned (
    order_id    TEXT NOT NULL,
    line_no     INT  NOT NULL,
    order_ts    TIMESTAMP NOT NULL,
    customer_sk INT  NOT NULL,
    product_sk  INT  NOT NULL,
    net_amount  NUMERIC(14,2) NOT NULL,
    PRIMARY KEY (order_id, line_no, order_ts)   -- la llave de partición debe ir en la PK
) PARTITION BY RANGE (order_ts);

CREATE TABLE dw.fact_sales_p2023 PARTITION OF dw.fact_sales_partitioned
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE dw.fact_sales_p2024 PARTITION OF dw.fact_sales_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE dw.fact_sales_p2025 PARTITION OF dw.fact_sales_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE dw.fact_sales_pdefault PARTITION OF dw.fact_sales_partitioned DEFAULT;

INSERT INTO dw.fact_sales_partitioned
SELECT order_id, line_no, order_ts, customer_sk, product_sk, net_amount FROM dw.fact_sales;
ANALYZE dw.fact_sales_partitioned;

-- Fíjate que el plan solo escanea fact_sales_p2024
EXPLAIN (COSTS OFF)
SELECT sum(net_amount) FROM dw.fact_sales_partitioned
WHERE order_ts >= '2024-03-01' AND order_ts < '2024-04-01';

-- ---------------------------------------------------------------------
-- 4) Anti-patrones comunes (y su corrección)
-- ---------------------------------------------------------------------
-- MAL: función sobre la columna indexada -> el índice NO se usa (no "sargable")
EXPLAIN (COSTS OFF)
SELECT count(*) FROM dw.fact_sales WHERE date_trunc('day', order_ts) = '2024-12-01';
-- BIEN: rango sobre la columna "desnuda"
EXPLAIN (COSTS OFF)
SELECT count(*) FROM dw.fact_sales WHERE order_ts >= '2024-12-01' AND order_ts < '2024-12-02';
