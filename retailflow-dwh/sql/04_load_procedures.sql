-- =====================================================================
-- 04_load_procedures.sql
-- Procedimientos de carga INCREMENTAL e IDEMPOTENTE (se pueden re-ejecutar
-- sin duplicar datos). Esto es lo que más preguntan en Data Engineering.
--   * dw.sp_scd2_customers()  -> SCD Tipo 2 (expirar + insertar versión)
--   * dw.sp_load_fact_sales() -> watermark + MERGE (upsert)
-- =====================================================================
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- SCD Tipo 2 incremental
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE dw.sp_scd2_customers()
LANGUAGE plpgsql
AS $$
DECLARE
    v_expired  INT;
    v_inserted INT;
BEGIN
    -- Última versión de cada cliente en staging (DISTINCT ON es exclusivo de PostgreSQL;
    -- el equivalente estándar es ROW_NUMBER() ... WHERE rn = 1)
    CREATE TEMP TABLE tmp_latest ON COMMIT DROP AS
    SELECT DISTINCT ON (customer_id)
           customer_id, full_name, email, city, country, segment, signup_date, valid_from,
           md5(concat_ws('|', city, country, segment)) AS row_hash
    FROM staging.customers_history
    ORDER BY customer_id, valid_from DESC;

    -- 1) Expirar la versión vigente si los atributos cambiaron
    UPDATE dw.dim_customer d
    SET    valid_to   = s.valid_from,
           is_current = FALSE
    FROM   tmp_latest s
    WHERE  d.customer_id = s.customer_id
      AND  d.is_current
      AND  d.row_hash <> s.row_hash
      AND  s.valid_from > d.valid_from;
    GET DIAGNOSTICS v_expired = ROW_COUNT;

    -- 2) Insertar nueva versión para clientes cambiados y clientes nuevos
    INSERT INTO dw.dim_customer (customer_id, full_name, email, city, country, segment,
                                 signup_date, valid_from, row_hash)
    SELECT s.customer_id, s.full_name, s.email, s.city, s.country, s.segment, s.signup_date,
           CASE WHEN NOT EXISTS (SELECT 1 FROM dw.dim_customer x WHERE x.customer_id = s.customer_id)
                THEN TIMESTAMP '1900-01-01' ELSE s.valid_from END,
           s.row_hash
    FROM tmp_latest s
    WHERE NOT EXISTS (                     -- anti-join: no tiene versión vigente
        SELECT 1 FROM dw.dim_customer d
        WHERE d.customer_id = s.customer_id AND d.is_current
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    INSERT INTO audit.etl_run_log(step_name, rows_affected)
    VALUES ('scd2_customers: expired=' || v_expired || ' inserted=' || v_inserted, v_inserted);
    RAISE NOTICE 'SCD2 customers -> expiradas: %, nuevas versiones: %', v_expired, v_inserted;
END;
$$;

-- ---------------------------------------------------------------------
-- Carga incremental de la tabla de hechos con WATERMARK + MERGE
-- Solo procesa órdenes ingeridas después de la última carga exitosa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE dw.sp_load_fact_sales()
LANGUAGE plpgsql
AS $$
DECLARE
    v_watermark TIMESTAMP;
    v_new_wm    TIMESTAMP;
    v_rows      INT;
BEGIN
    INSERT INTO audit.etl_watermark(table_name) VALUES ('dw.fact_sales')
    ON CONFLICT (table_name) DO NOTHING;

    SELECT last_loaded_at INTO v_watermark
    FROM audit.etl_watermark WHERE table_name = 'dw.fact_sales';

    SELECT max(_ingested_at) INTO v_new_wm
    FROM staging.orders WHERE _ingested_at > v_watermark;

    IF v_new_wm IS NULL THEN
        RAISE NOTICE 'fact_sales: no hay datos nuevos desde %', v_watermark;
        RETURN;
    END IF;

    MERGE INTO dw.fact_sales AS tgt
    USING (
        SELECT o.order_id, i.line_no,
               to_char(o.order_ts, 'YYYYMMDD')::int AS date_key,
               c.customer_sk,
               p.product_sk,
               o.order_ts, o.channel, o.status,
               i.quantity, i.unit_price, i.discount_pct, i.net_amount,
               round(i.quantity * p.unit_cost, 2) AS cost_amount
        FROM staging.orders o
        JOIN staging.order_items i ON i.order_id = o.order_id
        JOIN dw.dim_product p      ON p.product_id = i.product_id
        -- JOIN "point-in-time": la versión del cliente vigente CUANDO se hizo la orden
        JOIN dw.dim_customer c     ON c.customer_id = o.customer_id
                                  AND o.order_ts >= c.valid_from
                                  AND o.order_ts <  c.valid_to
        WHERE o._ingested_at > v_watermark
    ) AS src
    ON tgt.order_id = src.order_id AND tgt.line_no = src.line_no
    WHEN MATCHED AND tgt.order_status IS DISTINCT FROM src.status THEN
        UPDATE SET order_status = src.status, loaded_at = now()
    WHEN NOT MATCHED THEN
        INSERT (order_id, line_no, date_key, customer_sk, product_sk, order_ts, channel,
                order_status, quantity, unit_price, discount_pct, net_amount, cost_amount)
        VALUES (src.order_id, src.line_no, src.date_key, src.customer_sk, src.product_sk,
                src.order_ts, src.channel, src.status, src.quantity, src.unit_price,
                src.discount_pct, src.net_amount, src.cost_amount);
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    UPDATE audit.etl_watermark
    SET last_loaded_at = v_new_wm, rows_loaded = v_rows, updated_at = now()
    WHERE table_name = 'dw.fact_sales';

    INSERT INTO audit.etl_run_log(step_name, rows_affected) VALUES ('load_fact_sales', v_rows);
    RAISE NOTICE 'fact_sales: % filas insertadas/actualizadas. Nuevo watermark: %', v_rows, v_new_wm;
END;
$$;

-- Carga inicial
CALL dw.sp_load_fact_sales();
