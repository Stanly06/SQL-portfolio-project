-- =====================================================================
-- 06_incremental_load.sql
-- Ejecuta las cargas incrementales. Ejecutarlo DOS veces seguidas debe dar
-- "no hay datos nuevos" la segunda vez -> el pipeline es IDEMPOTENTE.
-- =====================================================================
CALL dw.sp_scd2_customers();
CALL dw.sp_load_fact_sales();

-- Verificación rápida
SELECT order_status, count(*) AS lineas
FROM dw.fact_sales GROUP BY order_status ORDER BY 2 DESC;

SELECT customer_id, city, country, valid_from, valid_to, is_current
FROM dw.dim_customer
WHERE customer_id = 'C00007'
ORDER BY valid_from;
