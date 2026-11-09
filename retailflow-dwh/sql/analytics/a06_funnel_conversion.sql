-- =====================================================================
-- a06 · Embudo de conversión (funnel) POR SESIÓN y por dispositivo
-- Pregunta: ¿En qué paso perdemos más usuarios? ¿Mobile convierte peor?
-- Funciones: sesionización (LAG + SUM OVER), bool_or, FILTER, ROLLUP,
--            FIRST_VALUE / LAG sobre los pasos del embudo
-- Nota: medirlo por USUARIO en 30 días infla la conversión (casi todos
-- terminan comprando alguna vez). El estándar es medir por sesión.
-- =====================================================================
WITH ordered AS (
    SELECT customer_id, event_type, event_ts, device_type,
           LAG(event_ts) OVER (PARTITION BY customer_id ORDER BY event_ts) AS prev_ts
    FROM staging.web_events
),
sessions AS (
    SELECT *,
           SUM(CASE WHEN prev_ts IS NULL OR event_ts - prev_ts > INTERVAL '30 minutes' THEN 1 ELSE 0 END)
               OVER (PARTITION BY customer_id ORDER BY event_ts ROWS UNBOUNDED PRECEDING) AS session_no
    FROM ordered
),
session_steps AS (
    SELECT customer_id, session_no,
           min(device_type)                    AS device_type,
           bool_or(event_type = 'page_view')   AS viewed,
           bool_or(event_type = 'add_to_cart') AS added,
           bool_or(event_type = 'checkout')    AS checked_out,
           bool_or(event_type = 'purchase')    AS purchased
    FROM sessions
    GROUP BY customer_id, session_no
)
SELECT CASE WHEN GROUPING(device_type) = 1 THEN 'TOTAL' ELSE device_type END AS device,
       count(*) FILTER (WHERE viewed)                               AS s1_view,
       count(*) FILTER (WHERE added)                                AS s2_cart,
       count(*) FILTER (WHERE checked_out)                          AS s3_checkout,
       count(*) FILTER (WHERE purchased)                            AS s4_purchase,
       round(100.0 * count(*) FILTER (WHERE added)       / NULLIF(count(*) FILTER (WHERE viewed), 0), 1)      AS view_to_cart_pct,
       round(100.0 * count(*) FILTER (WHERE checked_out) / NULLIF(count(*) FILTER (WHERE added), 0), 1)       AS cart_to_checkout_pct,
       round(100.0 * count(*) FILTER (WHERE purchased)   / NULLIF(count(*) FILTER (WHERE checked_out), 0), 1) AS checkout_to_buy_pct,
       round(100.0 * count(*) FILTER (WHERE purchased)   / NULLIF(count(*) FILTER (WHERE viewed), 0), 2)      AS conversion_pct
FROM session_steps
GROUP BY ROLLUP (device_type)       -- fila extra con el total general
ORDER BY GROUPING(device_type), device_type;

-- ---------------------------------------------------------------------
-- Formato "largo" (ideal para un gráfico de embudo en Power BI/Tableau)
-- con caída paso a paso usando FIRST_VALUE y LAG
-- ---------------------------------------------------------------------
WITH steps(step_no, step) AS (
    VALUES (1, 'page_view'), (2, 'add_to_cart'), (3, 'checkout'), (4, 'purchase')
),
ordered AS (
    SELECT customer_id, event_type, event_ts,
           LAG(event_ts) OVER (PARTITION BY customer_id ORDER BY event_ts) AS prev_ts
    FROM staging.web_events
),
sessions AS (
    SELECT customer_id, event_type,
           SUM(CASE WHEN prev_ts IS NULL OR event_ts - prev_ts > INTERVAL '30 minutes' THEN 1 ELSE 0 END)
               OVER (PARTITION BY customer_id ORDER BY event_ts ROWS UNBOUNDED PRECEDING) AS session_no
    FROM ordered
),
per_step AS (
    SELECT s.step_no, s.step,
           count(DISTINCT (e.customer_id, e.session_no)) AS sessions   -- DISTINCT sobre una tupla
    FROM steps s
    LEFT JOIN sessions e ON e.event_type = s.step
    GROUP BY s.step_no, s.step
)
SELECT step_no, step, sessions,
       round(100.0 * sessions / FIRST_VALUE(sessions) OVER (ORDER BY step_no), 1) AS pct_of_top,
       round(100.0 * sessions / LAG(sessions) OVER (ORDER BY step_no), 1)         AS pct_of_prev_step,
       LAG(sessions) OVER (ORDER BY step_no) - sessions                           AS dropped_sessions
FROM per_step
ORDER BY step_no;
