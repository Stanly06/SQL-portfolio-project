-- =====================================================================
-- a02 · Rankings, Top-N por grupo y análisis de Pareto (80/20)
-- Pregunta: ¿Cuáles son los 3 productos más vendidos de cada categoría?
-- ¿Qué % de productos genera el 80% de los ingresos?
-- Funciones: ROW_NUMBER, RANK, DENSE_RANK, PERCENT_RANK, SUM() OVER acumulado
-- =====================================================================

-- 1) Diferencia entre ROW_NUMBER, RANK y DENSE_RANK (pregunta clásica)
--    Ante empates: ROW_NUMBER -> 1,2,3 | RANK -> 1,1,3 | DENSE_RANK -> 1,1,2
WITH sample(product, units) AS (
    VALUES ('A', 100), ('B', 90), ('C', 90), ('D', 80)
)
SELECT product, units,
       ROW_NUMBER() OVER (ORDER BY units DESC) AS row_number,
       RANK()       OVER (ORDER BY units DESC) AS rank,
       DENSE_RANK() OVER (ORDER BY units DESC) AS dense_rank
FROM sample;

-- 2) Top 3 productos por ingresos dentro de cada categoría
WITH product_revenue AS (
    SELECT c.category_name,
           p.product_name,
           sum(f.net_amount) AS revenue
    FROM dw.fact_sales f
    JOIN dw.dim_product  p ON p.product_sk = f.product_sk
    JOIN dw.dim_category c ON c.category_id = p.category_id
    WHERE f.is_revenue
    GROUP BY c.category_name, p.product_name
),
ranked AS (
    SELECT *,
           DENSE_RANK() OVER (PARTITION BY category_name ORDER BY revenue DESC) AS rnk
    FROM product_revenue
)
SELECT category_name, rnk, product_name, revenue
FROM ranked
WHERE rnk <= 3                       -- no se puede filtrar una window function en el WHERE
ORDER BY category_name, rnk;         -- del mismo SELECT -> por eso el CTE

-- 3) Pareto: ingreso acumulado y clasificación ABC
WITH product_revenue AS (
    SELECT p.product_id, sum(f.net_amount) AS revenue
    FROM dw.fact_sales f
    JOIN dw.dim_product p ON p.product_sk = f.product_sk
    WHERE f.is_revenue
    GROUP BY p.product_id
),
cumulative AS (
    SELECT product_id, revenue,
           SUM(revenue) OVER (ORDER BY revenue DESC
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             / SUM(revenue) OVER () AS cum_share,
           round(PERCENT_RANK() OVER (ORDER BY revenue DESC)::numeric, 4) AS pct_rank
    FROM product_revenue
)
SELECT CASE WHEN cum_share <= 0.80 THEN 'A (80% ingresos)'
            WHEN cum_share <= 0.95 THEN 'B (siguiente 15%)'
            ELSE 'C (último 5%)' END        AS abc_class,
       count(*)                             AS products,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_products,
       round(sum(revenue), 2)               AS revenue
FROM cumulative
GROUP BY 1
ORDER BY 1;

-- 4) Mejor cliente de cada país (alternativa PostgreSQL: DISTINCT ON)
SELECT DISTINCT ON (c.country)
       c.country, c.customer_id, c.full_name, sum(f.net_amount) AS revenue
FROM dw.fact_sales f
JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
WHERE f.is_revenue
GROUP BY c.country, c.customer_id, c.full_name
ORDER BY c.country, revenue DESC;
