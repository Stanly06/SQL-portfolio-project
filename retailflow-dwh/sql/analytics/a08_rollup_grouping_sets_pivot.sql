-- =====================================================================
-- a08 · Subtotales multinivel y pivot
-- Funciones: ROLLUP, CUBE, GROUPING SETS, GROUPING(), FILTER (pivot)
-- =====================================================================

-- 1) ROLLUP: subtotales jerárquicos año > trimestre + gran total
SELECT CASE WHEN GROUPING(d.year) = 1 THEN 'TOTAL' ELSE d.year::text END        AS year,
       CASE WHEN GROUPING(d.quarter) = 1 AND GROUPING(d.year) = 0 THEN 'Subtotal año'
            WHEN GROUPING(d.quarter) = 1 THEN ''
            ELSE 'Q' || d.quarter END                                            AS quarter,
       sum(f.net_amount) AS revenue
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.date_key
WHERE f.is_revenue
GROUP BY ROLLUP (d.year, d.quarter)
ORDER BY d.year NULLS LAST, d.quarter NULLS LAST;

-- 2) GROUPING SETS: varias agregaciones independientes en UNA sola pasada
--    (equivale a varios GROUP BY unidos con UNION ALL, pero más eficiente)
SELECT c.top_level_category,
       f.channel,
       sum(f.net_amount)  AS revenue,
       GROUPING(c.top_level_category, f.channel) AS grouping_level  -- bitmask
FROM dw.fact_sales f
JOIN dw.dim_product  p ON p.product_sk = f.product_sk
JOIN dw.dim_category c ON c.category_id = p.category_id
WHERE f.is_revenue
GROUP BY GROUPING SETS ((c.top_level_category), (f.channel), ())
ORDER BY grouping_level, revenue DESC;

-- 3) PIVOT: ingresos por categoría (filas) x año (columnas)
--    En SQL Server existe PIVOT; en PostgreSQL se usa agregación condicional.
SELECT c.top_level_category,
       sum(f.net_amount) FILTER (WHERE d.year = 2023) AS rev_2023,
       sum(f.net_amount) FILTER (WHERE d.year = 2024) AS rev_2024,
       round(100.0 * (sum(f.net_amount) FILTER (WHERE d.year = 2024)
                    - sum(f.net_amount) FILTER (WHERE d.year = 2023))
             / sum(f.net_amount) FILTER (WHERE d.year = 2023), 2) AS growth_pct
FROM dw.fact_sales f
JOIN dw.dim_date d     ON d.date_key = f.date_key
JOIN dw.dim_product p  ON p.product_sk = f.product_sk
JOIN dw.dim_category c ON c.category_id = p.category_id
WHERE f.is_revenue
GROUP BY c.top_level_category
ORDER BY rev_2024 DESC;

-- 4) Ventas por día de la semana (fin de semana vs. entre semana)
SELECT d.day_of_week, d.day_name, d.is_weekend,
       count(DISTINCT f.order_id) AS orders,
       round(avg(f.net_amount), 2) AS avg_line_value
FROM dw.fact_sales f
JOIN dw.dim_date d ON d.date_key = f.date_key
GROUP BY d.day_of_week, d.day_name, d.is_weekend
ORDER BY d.day_of_week;
