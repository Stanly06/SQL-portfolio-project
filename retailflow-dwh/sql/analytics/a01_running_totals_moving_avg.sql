-- =====================================================================
-- a01 · Tendencias de ingresos: running total, media móvil, MoM y YoY
-- Pregunta de negocio: ¿Cómo evolucionan las ventas mes a mes y vs. el
-- año anterior? ¿Cuánto llevamos acumulado en el año?
-- Funciones: SUM() OVER, AVG() OVER con ROWS BETWEEN, LAG(), NULLIF
-- =====================================================================
WITH monthly AS (
    SELECT d.first_day_of_month          AS month,
           d.year,
           sum(f.net_amount)             AS revenue
    FROM dw.fact_sales f
    JOIN dw.dim_date d ON d.date_key = f.date_key
    WHERE f.is_revenue
    GROUP BY d.first_day_of_month, d.year
)
SELECT
    month,
    revenue,
    -- Acumulado del año (se reinicia cada año gracias a PARTITION BY)
    SUM(revenue) OVER (PARTITION BY year ORDER BY month)                         AS ytd_revenue,
    -- Media móvil de 3 meses: fila actual + 2 anteriores
    round(AVG(revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg_3m,
    -- Crecimiento vs. mes anterior
    LAG(revenue) OVER (ORDER BY month)                                           AS prev_month_revenue,
    round(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
          / NULLIF(LAG(revenue) OVER (ORDER BY month), 0), 2)                    AS mom_growth_pct,
    -- Crecimiento vs. mismo mes del año anterior (12 filas atrás)
    round(100.0 * (revenue - LAG(revenue, 12) OVER (ORDER BY month))
          / NULLIF(LAG(revenue, 12) OVER (ORDER BY month), 0), 2)                AS yoy_growth_pct,
    -- Participación del mes dentro de su año
    round(100.0 * revenue / SUM(revenue) OVER (PARTITION BY year), 2)            AS pct_of_year
FROM monthly
ORDER BY month;

-- ---------------------------------------------------------------------
-- Variante con WINDOW nombrada (más limpia cuando repites la ventana)
-- ---------------------------------------------------------------------
WITH monthly AS (
    SELECT d.first_day_of_month AS month, sum(f.net_amount) AS revenue
    FROM dw.fact_sales f JOIN dw.dim_date d ON d.date_key = f.date_key
    WHERE f.is_revenue
    GROUP BY 1
)
SELECT month, revenue,
       LAG(revenue)  OVER w AS prev_month,
       LEAD(revenue) OVER w AS next_month,
       revenue - LAG(revenue) OVER w AS diff_vs_prev
FROM monthly
WINDOW w AS (ORDER BY month)
ORDER BY month;
