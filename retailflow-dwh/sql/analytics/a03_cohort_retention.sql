-- =====================================================================
-- a03 · Análisis de cohortes y retención
-- Pregunta: De los clientes que compraron por primera vez en el mes X,
-- ¿qué % volvió a comprar 1, 2, 3... meses después?
-- Funciones: MIN() OVER, FIRST_VALUE, AGE/EXTRACT, conteo condicional
-- (Se analiza a nivel cliente -> customer_id, no customer_sk)
-- =====================================================================
WITH orders AS (
    SELECT DISTINCT c.customer_id,
           date_trunc('month', f.order_ts)::date AS order_month
    FROM dw.fact_sales f
    JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
),
with_cohort AS (
    SELECT customer_id,
           order_month,
           MIN(order_month) OVER (PARTITION BY customer_id) AS cohort_month
    FROM orders
),
with_index AS (
    SELECT cohort_month,
           customer_id,
           (EXTRACT(YEAR FROM age(order_month, cohort_month)) * 12
            + EXTRACT(MONTH FROM age(order_month, cohort_month)))::int AS month_number
    FROM with_cohort
),
cohort_counts AS (
    SELECT cohort_month, month_number, count(DISTINCT customer_id) AS customers
    FROM with_index
    GROUP BY cohort_month, month_number
)
SELECT cohort_month,
       FIRST_VALUE(customers) OVER (PARTITION BY cohort_month ORDER BY month_number) AS cohort_size,
       month_number,
       customers,
       round(100.0 * customers
             / FIRST_VALUE(customers) OVER (PARTITION BY cohort_month ORDER BY month_number), 1) AS retention_pct
FROM cohort_counts
WHERE cohort_month < '2023-07-01'          -- primeras cohortes, para que se lea bien
  AND month_number <= 6
ORDER BY cohort_month, month_number;

-- ---------------------------------------------------------------------
-- Matriz de retención "pivoteada" (formato típico de dashboard)
-- FILTER es la forma PostgreSQL de un CASE dentro del agregado.
-- ---------------------------------------------------------------------
WITH orders AS (
    SELECT DISTINCT c.customer_id, date_trunc('month', f.order_ts)::date AS order_month
    FROM dw.fact_sales f JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
),
idx AS (
    SELECT customer_id,
           MIN(order_month) OVER (PARTITION BY customer_id) AS cohort_month,
           order_month
    FROM orders
),
idx2 AS (
    SELECT cohort_month, customer_id,
           ((EXTRACT(YEAR FROM order_month) - EXTRACT(YEAR FROM cohort_month)) * 12
            + EXTRACT(MONTH FROM order_month) - EXTRACT(MONTH FROM cohort_month))::int AS m
    FROM idx
)
SELECT cohort_month,
       count(DISTINCT customer_id) FILTER (WHERE m = 0) AS m0,
       round(100.0 * count(DISTINCT customer_id) FILTER (WHERE m = 1) / count(DISTINCT customer_id) FILTER (WHERE m = 0), 1) AS m1_pct,
       round(100.0 * count(DISTINCT customer_id) FILTER (WHERE m = 2) / count(DISTINCT customer_id) FILTER (WHERE m = 0), 1) AS m2_pct,
       round(100.0 * count(DISTINCT customer_id) FILTER (WHERE m = 3) / count(DISTINCT customer_id) FILTER (WHERE m = 0), 1) AS m3_pct,
       round(100.0 * count(DISTINCT customer_id) FILTER (WHERE m = 6) / count(DISTINCT customer_id) FILTER (WHERE m = 0), 1) AS m6_pct
FROM idx2
GROUP BY cohort_month
ORDER BY cohort_month
LIMIT 12;
