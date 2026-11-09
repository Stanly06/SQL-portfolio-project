-- =====================================================================
-- 01_raw_generate.sql  (capa BRONZE)
-- Genera datos sintéticos REPRODUCIBLES de una tienda e-commerce
-- latinoamericana. A propósito incluye problemas reales:
--   * filas duplicadas (reintentos de la API)
--   * emails con mayúsculas/espacios, textos vacíos ('') y NULLs
--   * fechas y montos como TEXT (como llegan de un CSV/JSON)
--   * cambios de clientes en el tiempo (para SCD Tipo 2)
--   * eventos web en JSONB
-- Técnicas: generate_series, setseed/random, CTEs, JSONB
-- =====================================================================
SELECT setseed(0.42);   -- misma "aleatoriedad" en cada ejecución

-- ---------------- Clientes (versión del CRM, todo en TEXT) -------------
CREATE TABLE raw.customers (
    customer_id   TEXT,
    full_name     TEXT,
    email         TEXT,
    city          TEXT,
    country       TEXT,
    segment       TEXT,
    signup_date   TEXT,
    updated_at    TEXT,       -- fecha de la versión del registro
    _ingested_at  TIMESTAMP DEFAULT now()
);

INSERT INTO raw.customers (customer_id, full_name, email, city, country, segment, signup_date, updated_at)
SELECT
    'C' || lpad(g::text, 5, '0'),
    (ARRAY['Ana','Luis','María','Carlos','Sofía','Jorge','Valentina','Diego','Camila','Andrés'])[1 + floor(random()*10)::int]
      || ' ' ||
    (ARRAY['Pérez','Gómez','Rodríguez','Fernández','López','Martínez','Sánchez','Díaz','Torres','Ramírez'])[1 + floor(random()*10)::int],
    -- emails "sucios": a veces mayúsculas y espacios
    CASE WHEN random() < 0.15 THEN '  USER' || g || '@MAIL.COM ' ELSE 'user' || g || '@mail.com' END,
    city_country.city,
    city_country.country,
    CASE WHEN random() < 0.05 THEN '' ELSE (ARRAY['Consumer','Corporate','Small Business'])[1 + floor(random()*3)::int] END,
    to_char(DATE '2022-01-01' + (random()*700)::int, 'YYYY-MM-DD'),
    '2022-01-01 00:00:00'
FROM generate_series(1, 2000) g
CROSS JOIN LATERAL (
    SELECT (ARRAY['Santo Domingo','Ciudad de México','Bogotá','Lima','Madrid','Buenos Aires','Santiago'])[k] AS city,
           (ARRAY['República Dominicana','México','Colombia','Perú','España','Argentina','Chile'])[k] AS country
    FROM (SELECT 1 + floor(random()*7)::int + (g*0) AS k) s
) city_country;

-- Corrige updated_at = signup_date para la versión inicial
UPDATE raw.customers SET updated_at = signup_date || ' 08:00:00';

-- Cambios posteriores: ~300 clientes se mudan de ciudad o cambian de segmento
-- (llegan como NUEVAS filas del CRM -> material para SCD Tipo 2)
INSERT INTO raw.customers (customer_id, full_name, email, city, country, segment, signup_date, updated_at)
SELECT customer_id, full_name, email,
       CASE WHEN random() < 0.5 THEN 'Medellín' ELSE city END,
       CASE WHEN city <> 'Medellín' AND random() < 0.5 THEN 'Colombia' ELSE country END,
       'Corporate',
       signup_date,
       to_char(signup_date::date + 200 + (random()*200)::int, 'YYYY-MM-DD') || ' 09:30:00'
FROM raw.customers
WHERE random() < 0.15;

-- Duplicados exactos (reintentos de ingesta)
INSERT INTO raw.customers (customer_id, full_name, email, city, country, segment, signup_date, updated_at)
SELECT customer_id, full_name, email, city, country, segment, signup_date, updated_at
FROM raw.customers WHERE random() < 0.03;

-- ---------------- Categorías (jerarquía padre-hijo) --------------------
CREATE TABLE raw.categories (
    category_id        INT,
    category_name      TEXT,
    parent_category_id INT
);
INSERT INTO raw.categories VALUES
 (1,'Todos los productos',NULL),
 (2,'Electrónica',1),(3,'Hogar',1),(4,'Moda',1),
 (5,'Celulares',2),(6,'Computadoras',2),(7,'Accesorios',2),
 (8,'Cocina',3),(9,'Muebles',3),
 (10,'Ropa',4),(11,'Calzado',4),
 (12,'Laptops Gamer',6);

-- ---------------- Productos ------------------------------------------
CREATE TABLE raw.products (
    product_id   TEXT,
    product_name TEXT,
    category_id  INT,
    unit_price   TEXT,
    unit_cost    TEXT,
    is_active    TEXT
);
INSERT INTO raw.products
SELECT 'P' || lpad(g::text, 4, '0'),
       'Producto ' || g,
       c.cat,
       round((5 + random()*995)::numeric, 2)::text,
       NULL,
       CASE WHEN random() < 0.9 THEN 'Y' ELSE 'N' END
FROM generate_series(1, 200) g
CROSS JOIN LATERAL (SELECT (ARRAY[5,6,7,8,9,10,11,12])[1 + floor(random()*8)::int] + (g*0) AS cat) c;
UPDATE raw.products SET unit_cost = round(unit_price::numeric * (0.45 + random()*0.3)::numeric, 2)::text;

-- ---------------- Órdenes y líneas de orden ---------------------------
CREATE TABLE raw.orders (
    order_id      TEXT,
    customer_id   TEXT,
    order_ts      TEXT,
    status        TEXT,
    channel       TEXT,
    _ingested_at  TIMESTAMP DEFAULT now()
);

-- _ingested_at explícito (lote inicial cargado el 2025-01-01 02:00) para que
-- el pipeline sea reproducible. Usar now() aquí rompe el watermark (ver docs).
INSERT INTO raw.orders (order_id, customer_id, order_ts, status, channel, _ingested_at)
SELECT 'O' || lpad(g::text, 7, '0'),
       -- clientes con distinta frecuencia de compra (sesgo con potencia)
       'C' || lpad((1 + floor(2000 * power(random(), 1.5)))::int::text, 5, '0'),
       CASE
         -- ~8% de las órdenes caen en la semana de Black Friday (estacionalidad)
         WHEN g % 12 = 0 THEN to_char(
              (CASE WHEN random() < 0.4 THEN TIMESTAMP '2023-11-20' ELSE TIMESTAMP '2024-11-25' END)
              + (random() * 7) * INTERVAL '1 day', 'YYYY-MM-DD HH24:MI:SS')
         -- power(random, 0.75) -> más órdenes hacia el final = crecimiento del negocio
         ELSE to_char(TIMESTAMP '2023-01-01' + (power(random(), 0.75) * 730) * INTERVAL '1 day', 'YYYY-MM-DD HH24:MI:SS')
       END,
       CASE WHEN r < 0.80 THEN 'delivered'
            WHEN r < 0.88 THEN 'shipped'
            WHEN r < 0.95 THEN 'cancelled'
            ELSE 'RETURNED' END,          -- inconsistencia de mayúsculas a propósito
       (ARRAY['web','app','marketplace', NULL])[1 + floor(random()*4)::int],
       TIMESTAMP '2025-01-01 02:00:00'
FROM generate_series(1, 25000) g
CROSS JOIN LATERAL (SELECT random() + (g*0) AS r) x;

-- Órdenes duplicadas (la API reenvió el mismo evento)
INSERT INTO raw.orders (order_id, customer_id, order_ts, status, channel, _ingested_at)
SELECT order_id, customer_id, order_ts, status, channel, TIMESTAMP '2025-01-01 02:05:00'
FROM raw.orders WHERE random() < 0.02;

CREATE TABLE raw.order_items (
    order_id   TEXT,
    line_no    INT,
    product_id TEXT,
    quantity   TEXT,
    unit_price TEXT,
    discount   TEXT
);
INSERT INTO raw.order_items
SELECT o.order_id,
       l.line_no,
       -- pocos productos "estrella" venden mucho (distribución tipo Pareto)
       'P' || lpad((1 + floor(200 * power(random(), 3)))::int::text, 4, '0'),
       (1 + floor(random()*4))::int::text,
       NULL,
       CASE WHEN random() < 0.25 THEN '0.10' WHEN random() < 0.05 THEN '' ELSE '0' END
FROM (SELECT DISTINCT order_id FROM raw.orders) o
CROSS JOIN LATERAL generate_series(1, 1 + floor(random()*4)::int + (length(o.order_id)*0)) AS l(line_no);

-- precio de la línea = precio de lista del producto
UPDATE raw.order_items i SET unit_price = p.unit_price
FROM raw.products p WHERE p.product_id = i.product_id;

-- ---------------- Eventos web (JSONB, semi-estructurado) --------------
-- 20,000 sesiones de navegación. Cada sesión avanza por el embudo
-- page_view -> add_to_cart -> checkout -> purchase con abandono en cada paso.
-- Los eventos de una sesión están separados por pocos minutos.
CREATE TABLE raw.web_events (
    event_id   BIGINT GENERATED ALWAYS AS IDENTITY,
    payload    JSONB
);
INSERT INTO raw.web_events (payload)
SELECT jsonb_build_object(
    'customer_id', s.customer_id,
    'event_type',  e.event_type,
    'event_ts',    to_char(s.session_start + (e.step_no * (1 + random()*4)) * INTERVAL '1 minute',
                           'YYYY-MM-DD"T"HH24:MI:SS'),
    'device',      jsonb_build_object('type', s.device, 'os', s.os)
)
FROM (
    SELECT g AS session_id,
           'C' || lpad((1 + floor(random()*2000))::int::text, 5, '0') AS customer_id,
           TIMESTAMP '2024-06-01' + (random()*30) * INTERVAL '1 day'   AS session_start,
           d.device,
           CASE WHEN d.device = 'desktop' THEN (ARRAY['windows','macos'])[1 + floor(random()*2)::int]
                ELSE (ARRAY['android','ios'])[1 + floor(random()*2)::int] END AS os,
           -- profundidad alcanzada en el embudo (mobile abandona más)
           CASE WHEN random() < 0.35 THEN 1
                WHEN random() < CASE d.device WHEN 'mobile' THEN 0.55 ELSE 0.40 END THEN 2
                WHEN random() < 0.45 THEN 3
                ELSE 4 END AS depth,
           1 + floor(random()*3)::int AS page_views
    FROM generate_series(1, 20000) g
    CROSS JOIN LATERAL (SELECT (ARRAY['mobile','mobile','mobile','desktop','desktop','tablet'])[1 + floor(random()*6)::int + (g*0)] AS device) d
) s
CROSS JOIN LATERAL (
    -- varios page_view al inicio + los pasos alcanzados
    SELECT pv AS step_no, 'page_view' AS event_type FROM generate_series(0, s.page_views - 1) pv
    UNION ALL
    SELECT s.page_views + k - 2,
           (ARRAY['page_view','add_to_cart','checkout','purchase'])[k]
    FROM generate_series(2, s.depth) k
) e;

INSERT INTO audit.etl_run_log(step_name, rows_affected)
SELECT 'raw_generate', (SELECT count(*) FROM raw.orders);
