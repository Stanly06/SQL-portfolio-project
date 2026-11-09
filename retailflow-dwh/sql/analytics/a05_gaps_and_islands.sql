-- =====================================================================
-- a05 · Gaps & Islands y Sesionización
-- Funciones: ROW_NUMBER, LAG, SUM() OVER como contador acumulado
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ISLANDS: rachas de meses CONSECUTIVOS con compra por cliente.
--    Truco: (mes - ROW_NUMBER) es constante dentro de una racha.
-- ---------------------------------------------------------------------
WITH months AS (
    SELECT DISTINCT c.customer_id,
           date_trunc('month', f.order_ts)::date AS m
    FROM dw.fact_sales f
    JOIN dw.dim_customer c ON c.customer_sk = f.customer_sk
    WHERE f.is_revenue
),
grp AS (
    SELECT customer_id, m,
           -- número de mes absoluto - posición = identificador de la isla
           (EXTRACT(YEAR FROM m) * 12 + EXTRACT(MONTH FROM m))
           - ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY m) AS island_id
    FROM months
),
islands AS (
    SELECT customer_id, island_id,
           min(m) AS streak_start,
           max(m) AS streak_end,
           count(*) AS months_in_streak
    FROM grp
    GROUP BY customer_id, island_id
)
SELECT customer_id, streak_start, streak_end, months_in_streak
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY months_in_streak DESC, streak_start) AS rn
    FROM islands
) x
WHERE rn = 1
ORDER BY months_in_streak DESC, customer_id
LIMIT 10;

-- ---------------------------------------------------------------------
-- 2) GAPS: ¿hubo días SIN ventas? (generate_series + LEFT JOIN anti-join)
-- ---------------------------------------------------------------------
WITH calendar AS (
    SELECT generate_series(DATE '2023-01-01', DATE '2024-12-31', INTERVAL '1 day')::date AS day
),
sales_days AS (
    SELECT DISTINCT order_ts::date AS day FROM dw.fact_sales
)
SELECT count(*) AS days_without_sales
FROM calendar cal
LEFT JOIN sales_days s ON s.day = cal.day
WHERE s.day IS NULL;

-- ---------------------------------------------------------------------
-- 3) SESIONIZACIÓN de eventos web: nueva sesión si pasan > 30 min
--    entre eventos del mismo usuario.
--    Paso 1: LAG para ver el evento anterior
--    Paso 2: flag 1/0 de "nueva sesión"
--    Paso 3: SUM() OVER acumulado del flag = session_id
-- ---------------------------------------------------------------------
WITH ordered AS (
    SELECT customer_id, event_type, event_ts, device_type,
           LAG(event_ts) OVER (PARTITION BY customer_id ORDER BY event_ts) AS prev_ts
    FROM staging.web_events
),
flagged AS (
    SELECT *,
           CASE WHEN prev_ts IS NULL OR event_ts - prev_ts > INTERVAL '30 minutes'
                THEN 1 ELSE 0 END AS is_new_session
    FROM ordered
),
sessions AS (
    SELECT *,
           SUM(is_new_session) OVER (PARTITION BY customer_id ORDER BY event_ts
                                     ROWS UNBOUNDED PRECEDING) AS session_no
    FROM flagged
),
session_summary AS (
    SELECT customer_id, session_no,
           min(event_ts) AS session_start,
           max(event_ts) AS session_end,
           count(*)      AS events,
           bool_or(event_type = 'purchase') AS converted
    FROM sessions
    GROUP BY customer_id, session_no
)
SELECT count(*)                                            AS total_sessions,
       round(avg(events), 2)                               AS avg_events_per_session,
       round(avg(EXTRACT(EPOCH FROM session_end - session_start) / 60)::numeric, 1) AS avg_minutes,
       round(100.0 * count(*) FILTER (WHERE converted) / count(*), 2) AS session_conversion_pct
FROM session_summary;
