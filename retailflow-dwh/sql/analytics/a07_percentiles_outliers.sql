-- =====================================================================
-- a07 · Estadística en SQL: mediana, percentiles y detección de outliers
-- Funciones: PERCENTILE_CONT / PERCENTILE_DISC (WITHIN GROUP),
--            AVG/STDDEV como window function (z-score), regla IQR
-- =====================================================================

-- 1) Distribución del valor de la orden por canal
WITH order_values AS (
    SELECT order_id, channel, sum(net_amount) AS order_value
    FROM dw.fact_sales
    WHERE is_revenue
    GROUP BY order_id, channel
)
SELECT channel,
       count(*)                                                        AS orders,
       round(avg(order_value), 2)                                      AS mean,
       round(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY order_value)::numeric, 2) AS median,
       round(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY order_value)::numeric, 2) AS p25,
       round(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY order_value)::numeric, 2) AS p75,
       round(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY order_value)::numeric, 2) AS p95,
       round(stddev(order_value), 2)                                   AS std_dev
FROM order_values
GROUP BY channel
ORDER BY median DESC;

-- 2) Outliers con z-score: |valor - media| / desviación > 3
WITH order_values AS (
    SELECT order_id, sum(net_amount) AS order_value
    FROM dw.fact_sales WHERE is_revenue
    GROUP BY order_id
),
z AS (
    SELECT order_id, order_value,
           (order_value - AVG(order_value) OVER ()) / NULLIF(STDDEV(order_value) OVER (), 0) AS z_score
    FROM order_values
)
SELECT order_id, order_value, round(z_score, 2) AS z_score
FROM z
WHERE abs(z_score) > 3
ORDER BY z_score DESC
LIMIT 10;

-- 3) Outliers con IQR (más robusto que z-score ante distribuciones sesgadas)
WITH order_values AS (
    SELECT order_id, sum(net_amount) AS order_value
    FROM dw.fact_sales WHERE is_revenue
    GROUP BY order_id
),
bounds AS (
    SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY order_value) AS q1,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY order_value) AS q3
    FROM order_values
)
SELECT round(q1::numeric, 2) AS q1, round(q3::numeric, 2) AS q3,
       round((q3 + 1.5 * (q3 - q1))::numeric, 2) AS upper_fence,
       (SELECT count(*) FROM order_values, bounds b2
        WHERE order_value > b2.q3 + 1.5 * (b2.q3 - b2.q1)) AS outlier_orders
FROM bounds;
