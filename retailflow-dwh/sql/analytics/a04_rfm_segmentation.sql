-- =====================================================================
-- a04 · Segmentación RFM (Recency, Frequency, Monetary)
-- Pregunta: ¿Quiénes son los "Campeones", los "En riesgo" y los "Perdidos"?
-- Funciones: NTILE(5), CASE, agregaciones; fecha de referencia fija.
-- =====================================================================
WITH params AS (
    SELECT DATE '2025-02-01' AS ref_date        -- "hoy" para el análisis
),
customer_metrics AS (
    SELECT c.customer_id,
           (SELECT ref_date FROM params) - max(f.order_ts)::date AS recency_days,
           count(DISTINCT f.order_id)                            AS frequency,
           sum(f.net_amount)                                     AS monetary
    FROM dw.fact_sales f
    JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
    GROUP BY c.customer_id
),
scored AS (
    SELECT *,
           NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,   -- más reciente = 5
           NTILE(5) OVER (ORDER BY frequency ASC)     AS f_score,
           NTILE(5) OVER (ORDER BY monetary ASC)      AS m_score
    FROM customer_metrics
),
segmented AS (
    SELECT *,
           r_score::text || f_score::text || m_score::text AS rfm_code,
           CASE
               WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Campeones'
               WHEN r_score >= 3 AND f_score >= 3                  THEN 'Leales'
               WHEN r_score >= 4 AND f_score <= 2                  THEN 'Nuevos / Prometedores'
               WHEN r_score <= 2 AND f_score >= 3                  THEN 'En riesgo'
               WHEN r_score <= 2 AND f_score <= 2                  THEN 'Perdidos'
               ELSE 'Necesitan atención'
           END AS segment
    FROM scored
)
SELECT segment,
       count(*)                            AS customers,
       round(avg(recency_days))            AS avg_recency_days,
       round(avg(frequency), 1)            AS avg_orders,
       round(avg(monetary), 2)             AS avg_monetary,
       round(100.0 * sum(monetary) / sum(sum(monetary)) OVER (), 1) AS pct_revenue
FROM segmented
GROUP BY segment
ORDER BY pct_revenue DESC;
