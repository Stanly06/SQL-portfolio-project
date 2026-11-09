-- =====================================================================
-- 05_new_batch.sql
-- Simula que "llega el día siguiente": un nuevo lote de datos a la capa RAW.
--   * 1,000 órdenes nuevas (enero 2025)
--   * 500 órdenes 'shipped' que ahora pasan a 'delivered' (UPDATE en origen)
--   * 50 clientes que se mudan (cambio para SCD2)
-- Flujo completo para probar la carga incremental:
--   05_new_batch.sql -> 02_staging.sql -> 06_incremental_load.sql
-- =====================================================================
SELECT setseed(0.99);

-- Órdenes nuevas
INSERT INTO raw.orders (order_id, customer_id, order_ts, status, channel, _ingested_at)
SELECT 'O' || lpad((25000 + g)::text, 7, '0'),
       'C' || lpad((1 + floor(random()*2000))::int::text, 5, '0'),
       to_char(TIMESTAMP '2025-01-01' + (random()*30) * INTERVAL '1 day', 'YYYY-MM-DD HH24:MI:SS'),
       'shipped',
       (ARRAY['web','app','marketplace'])[1 + floor(random()*3)::int],
       TIMESTAMP '2025-02-01 02:00:00'          -- el lote del día siguiente
FROM generate_series(1, 1000) g;

INSERT INTO raw.order_items (order_id, line_no, product_id, quantity, unit_price, discount)
SELECT o.order_id, 1, p.product_id, '1', p.unit_price, '0'
FROM raw.orders o
JOIN raw.products p ON p.product_id = 'P' || lpad((1 + (substr(o.order_id, 2)::int % 200))::text, 4, '0')
WHERE o.order_id > 'O0025000';

-- Cambio de estado: llega una nueva versión del mismo order_id
INSERT INTO raw.orders (order_id, customer_id, order_ts, status, channel, _ingested_at)
SELECT order_id, customer_id, order_ts, 'delivered', channel, TIMESTAMP '2025-02-01 03:00:00'
FROM (SELECT DISTINCT ON (order_id) * FROM raw.orders
      WHERE status = 'shipped' AND order_id <= 'O0025000'
      ORDER BY order_id, _ingested_at DESC LIMIT 500) s;

-- 50 clientes se mudan a Panamá
INSERT INTO raw.customers (customer_id, full_name, email, city, country, segment, signup_date, updated_at)
SELECT customer_id, full_name, email, 'Ciudad de Panamá', 'Panamá', segment, signup_date, '2025-01-15 10:00:00'
FROM (SELECT DISTINCT ON (customer_id) * FROM raw.customers ORDER BY customer_id, updated_at DESC) c
WHERE customer_id <= 'C00050';
