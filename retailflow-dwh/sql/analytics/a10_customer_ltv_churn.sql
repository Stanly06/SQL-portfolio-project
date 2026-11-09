-- =====================================================================
-- a10 · Comportamiento del cliente: tiempo entre compras, LTV y churn
-- Funciones: LEAD/LAG con fechas, FIRST_VALUE/LAST_VALUE y el FRAME
--            correcto, ROWS vs RANGE, COUNT() OVER, análisis SCD2
-- =====================================================================

-- 1) Días entre compras consecutivas y clientes "churned"
WITH customer_orders AS (
    SELECT DISTINCT c.customer_id, f.order_id, f.order_ts::date AS order_date
    FROM dw.fact_sales f
    JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
),
gaps AS (
    SELECT customer_id, order_id, order_date,
           order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS days_since_prev,
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id)                AS order_seq,
           COUNT(*)     OVER (PARTITION BY customer_id)                                               AS total_orders,
           FIRST_VALUE(order_date) OVER (PARTITION BY customer_id ORDER BY order_date)                AS first_order,
           -- ¡OJO! LAST_VALUE necesita el frame completo; con el frame por defecto
           -- (RANGE UNBOUNDED PRECEDING AND CURRENT ROW) devolvería la fila actual.
           LAST_VALUE(order_date) OVER (PARTITION BY customer_id ORDER BY order_date
                                        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_order
    FROM customer_orders
)
SELECT customer_id,
       total_orders,
       first_order,
       last_order,
       round(avg(days_since_prev), 1) AS avg_days_between_orders,
       DATE '2025-02-01' - last_order AS days_since_last_order,
       CASE WHEN DATE '2025-02-01' - last_order > 3 * avg(days_since_prev) THEN 'churn_risk'
            ELSE 'active' END AS status
FROM gaps
GROUP BY customer_id, total_orders, first_order, last_order
ORDER BY total_orders DESC
LIMIT 15;

-- 2) LTV acumulado por cliente y momento en que superó $10,000
WITH ltv AS (
    SELECT c.customer_id, f.order_ts,
           SUM(f.net_amount) OVER (PARTITION BY c.customer_id ORDER BY f.order_ts, f.order_id, f.line_no) AS running_ltv
    FROM dw.fact_sales f
    JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
)
SELECT customer_id, min(order_ts) AS reached_10k_at
FROM ltv
WHERE running_ltv >= 10000
GROUP BY customer_id
ORDER BY reached_10k_at
LIMIT 10;

-- 3) ROWS vs RANGE: diferencia cuando hay empates en el ORDER BY
WITH t(day, amount) AS (VALUES (1, 10), (2, 20), (2, 30), (3, 40))
SELECT day, amount,
       SUM(amount) OVER (ORDER BY day ROWS  BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_sum,
       SUM(amount) OVER (ORDER BY day RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS range_sum
FROM t;
-- rows_sum : 10, 30, 60, 100  (fila por fila)
-- range_sum: 10, 60, 60, 100  (todas las filas con el mismo "day" juntas)

-- 4) Gracias al SCD2: ventas atribuidas a la ciudad DONDE vivía el cliente al comprar
--    vs. su ciudad ACTUAL. (Esto es imposible con una dimensión SCD1.)
SELECT hist.city                    AS city_at_purchase,
       cur.city                     AS current_city,
       count(DISTINCT f.order_id)   AS orders,
       sum(f.net_amount)            AS revenue
FROM dw.fact_sales f
JOIN dw.dim_customer hist ON hist.customer_sk = f.customer_sk
JOIN dw.dim_customer cur  ON cur.customer_id = hist.customer_id AND cur.is_current
WHERE hist.city <> cur.city
GROUP BY hist.city, cur.city
ORDER BY revenue DESC
LIMIT 10;
