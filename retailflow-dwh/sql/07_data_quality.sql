-- =====================================================================
-- 07_data_quality.sql
-- "Tests" de calidad de datos en SQL puro (lo mismo que hacen dbt tests o
-- Great Expectations). Cada prueba devuelve el número de filas que FALLAN.
-- =====================================================================
WITH tests AS (
    -- 1. Unicidad de la llave natural en staging
    SELECT 'unique: staging.orders.order_id' AS test_name,
           (SELECT count(*) FROM (SELECT order_id FROM staging.orders
                                  GROUP BY order_id HAVING count(*) > 1) d) AS failures
    UNION ALL
    -- 2. Integridad referencial: líneas sin producto válido
    SELECT 'fk: order_items -> products',
           (SELECT count(*) FROM staging.order_items i
            LEFT JOIN staging.products p ON p.product_id = i.product_id
            WHERE p.product_id IS NULL)
    UNION ALL
    -- 3. SCD2: exactamente una versión vigente por cliente
    SELECT 'scd2: una versión vigente por cliente',
           (SELECT count(*) FROM (SELECT customer_id FROM dw.dim_customer
                                  GROUP BY customer_id
                                  HAVING count(*) FILTER (WHERE is_current) <> 1) d)
    UNION ALL
    -- 4. SCD2: sin huecos ni solapamientos entre versiones (LEAD)
    SELECT 'scd2: rangos contiguos sin solapamiento',
           (SELECT count(*) FROM (
                SELECT valid_to,
                       LEAD(valid_from) OVER (PARTITION BY customer_id ORDER BY valid_from) AS next_from
                FROM dw.dim_customer) x
            WHERE next_from IS NOT NULL AND next_from <> valid_to)
    UNION ALL
    -- 5. Reconciliación: el total de staging debe cuadrar con el DW
    SELECT 'reconciliación: net_amount staging = dw',
           (SELECT CASE WHEN (SELECT sum(net_amount) FROM staging.order_items)
                           = (SELECT sum(net_amount) FROM dw.fact_sales) THEN 0 ELSE 1 END)
    UNION ALL
    -- 6. Completitud: conteo de filas staging vs DW
    SELECT 'completitud: filas staging = dw',
           (SELECT abs((SELECT count(*) FROM staging.order_items) - (SELECT count(*) FROM dw.fact_sales)))
    UNION ALL
    -- 7. Reglas de negocio: montos no negativos y descuentos válidos
    SELECT 'regla: net_amount >= 0 y descuento entre 0 y 1',
           (SELECT count(*) FROM dw.fact_sales
            WHERE net_amount < 0 OR discount_pct NOT BETWEEN 0 AND 1)
    UNION ALL
    -- 8. Valores aceptados (accepted_values)
    SELECT 'accepted_values: order_status',
           (SELECT count(*) FROM dw.fact_sales
            WHERE order_status NOT IN ('delivered','shipped','cancelled','returned'))
    UNION ALL
    -- 9. Frescura: el dato más reciente no debe ser más viejo que el watermark
    SELECT 'frescura: watermark actualizado',
           (SELECT count(*) FROM audit.etl_watermark
            WHERE table_name = 'dw.fact_sales' AND last_loaded_at < (SELECT max(_ingested_at) FROM staging.orders))
    UNION ALL
    -- 10. Nulos en columnas críticas de origen (informativo)
    SELECT 'info: emails nulos en clientes',
           (SELECT count(*) FROM dw.dim_customer WHERE email IS NULL OR email = '')
)
SELECT test_name,
       failures,
       CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM tests;
