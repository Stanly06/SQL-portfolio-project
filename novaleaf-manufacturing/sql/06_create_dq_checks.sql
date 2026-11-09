/* =====================================================================
   06_create_dq_checks.sql
   Data quality checks that run AFTER staging is loaded. Constraints catch
   problems inside one row/table; these checks catch problems BETWEEN
   processes (receiving vs inventory, production vs inventory, sales vs
   shipments, quality vs consumption).

   Severity:
     ERROR   -> the numbers of two processes do not reconcile
     WARNING -> suspicious data that was kept but needs review
   Each run is stored, so results can be compared over time.
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE dq.check_run (
    run_id     INT IDENTITY(1,1) CONSTRAINT pk_check_run PRIMARY KEY,
    batch_id   INT          NOT NULL,
    run_at     DATETIME2(0) NOT NULL CONSTRAINT df_check_run_at DEFAULT SYSDATETIME()
);

CREATE TABLE dq.check_result (
    run_id      INT          NOT NULL CONSTRAINT fk_check_result_run REFERENCES dq.check_run(run_id),
    check_code  VARCHAR(10)  NOT NULL,
    check_name  VARCHAR(200) NOT NULL,
    severity    VARCHAR(10)  NOT NULL CONSTRAINT ck_check_severity CHECK (severity IN ('ERROR', 'WARNING')),
    failed_rows INT          NOT NULL,
    status      AS (CASE WHEN failed_rows = 0 THEN 'PASS'
                         WHEN severity = 'ERROR' THEN 'FAIL' ELSE 'WARN' END),
    CONSTRAINT pk_check_result PRIMARY KEY (run_id, check_code)
);
GO

CREATE OR ALTER PROCEDURE dq.usp_run_checks
    @batch_id INT = 1
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @run_id INT;

    INSERT INTO dq.check_run (batch_id) VALUES (@batch_id);
    SET @run_id = SCOPE_IDENTITY();

    /* C01 - Row accounting: stg row count = rows_loaded in the load log */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C01', 'Staging row counts reconcile with load log', 'ERROR', COUNT(*)
    FROM (
        SELECT 'supplier' AS entity, COUNT(*) AS n FROM stg.supplier UNION ALL
        SELECT 'material',           COUNT(*)      FROM stg.material UNION ALL
        SELECT 'product',            COUNT(*)      FROM stg.product UNION ALL
        SELECT 'bill_of_materials',  COUNT(*)      FROM stg.bill_of_materials UNION ALL
        SELECT 'customer',           COUNT(*)      FROM stg.customer UNION ALL
        SELECT 'receipt_lot',        COUNT(*)      FROM stg.receipt_lot UNION ALL
        SELECT 'production_order',   COUNT(*)      FROM stg.production_order UNION ALL
        SELECT 'quality_inspection', COUNT(*)      FROM stg.quality_inspection UNION ALL
        SELECT 'sales_order',        COUNT(*)      FROM stg.sales_order UNION ALL
        SELECT 'sales_order_line',   COUNT(*)      FROM stg.sales_order_line UNION ALL
        SELECT 'inventory_movement', COUNT(*)      FROM stg.inventory_movement
    ) AS s
    LEFT JOIN etl.load_step_log AS l
           ON l.entity = s.entity AND l.batch_id = @batch_id
    WHERE l.rows_loaded IS NULL OR l.rows_loaded <> s.n;

    /* C02 - Every accepted lot has exactly one RECEIPT movement */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C02', 'Each received lot has exactly one RECEIPT movement', 'ERROR', COUNT(*)
    FROM stg.receipt_lot AS r
    WHERE (SELECT COUNT(*) FROM stg.inventory_movement AS m
           WHERE m.lot_code = r.lot_code AND m.movement_type = 'RECEIPT') <> 1;

    /* C03 - RECEIPT movement quantity equals the quantity received in the lot */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C03', 'RECEIPT movement qty equals lot qty_received', 'ERROR', COUNT(*)
    FROM stg.receipt_lot AS r
    JOIN stg.inventory_movement AS m
      ON m.lot_code = r.lot_code AND m.movement_type = 'RECEIPT'
    WHERE m.qty <> r.qty_received;

    /* C04 - No lot can end with a negative balance */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C04', 'No lot has a negative inventory balance', 'ERROR', COUNT(*)
    FROM (
        SELECT lot_code
        FROM stg.inventory_movement
        WHERE lot_code IS NOT NULL
        GROUP BY lot_code
        HAVING SUM(signed_qty) < 0
    ) AS neg;

    /* C05 - PRODUCTION_OUTPUT movements equal produced_qty of completed orders */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C05', 'Production output movements equal produced_qty', 'ERROR', COUNT(*)
    FROM stg.production_order AS p
    LEFT JOIN (
        SELECT production_order_code, SUM(qty) AS output_qty
        FROM stg.inventory_movement
        WHERE movement_type = 'PRODUCTION_OUTPUT'
        GROUP BY production_order_code
    ) AS o ON o.production_order_code = p.production_order_code
    WHERE p.status = 'COMPLETED'
      AND COALESCE(o.output_qty, 0) <> p.produced_qty;

    /* C06 - Shipped quantity per order and product equals the order lines
             (aggregate BOTH sides first, then compare -> avoids join fan-out) */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C06', 'Shipments reconcile with sales order lines (shipped orders)', 'ERROR', COUNT(*)
    FROM (
        SELECT l.sales_order_code, l.product_code, SUM(l.qty) AS qty
        FROM stg.sales_order_line AS l
        JOIN stg.sales_order AS h ON h.sales_order_code = l.sales_order_code
        WHERE h.status = 'SHIPPED'
        GROUP BY l.sales_order_code, l.product_code
    ) AS ordered
    FULL OUTER JOIN (
        SELECT sales_order_code, item_code AS product_code, SUM(qty) AS qty
        FROM stg.inventory_movement
        WHERE movement_type = 'SALE_SHIPMENT'
        GROUP BY sales_order_code, item_code
    ) AS shipped
      ON  shipped.sales_order_code = ordered.sales_order_code
      AND shipped.product_code     = ordered.product_code
    WHERE ordered.qty IS NULL OR shipped.qty IS NULL OR ordered.qty <> shipped.qty;

    /* C07 - Material issued to production from a lot whose LATEST incoming
             inspection is not PASS (or that was never inspected) */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C07', 'Material issued from a lot not approved by quality', 'WARNING', COUNT(*)
    FROM stg.inventory_movement AS m
    OUTER APPLY (
        SELECT TOP (1) i.result
        FROM stg.quality_inspection AS i
        WHERE i.lot_code = m.lot_code
        ORDER BY i.inspection_date DESC, i.inspection_code DESC
    ) AS last_insp
    WHERE m.movement_type = 'ISSUE_TO_PRODUCTION'
      AND COALESCE(last_insp.result, 'NONE') <> 'PASS';

    /* C08 - Production orders that end before they start */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C08', 'Production order end_ts earlier than start_ts', 'WARNING', COUNT(*)
    FROM stg.production_order
    WHERE end_ts < start_ts;

    /* C09 - Sales orders shipped before they were ordered */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C09', 'Sales order ship_date earlier than order_date', 'WARNING', COUNT(*)
    FROM stg.sales_order
    WHERE ship_date < order_date;

    /* C10 - Completed production orders without a FINAL inspection that passed */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C10', 'Completed order without a passing FINAL inspection', 'WARNING', COUNT(*)
    FROM stg.production_order AS p
    WHERE p.status = 'COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM stg.quality_inspection AS i
                      WHERE i.production_order_code = p.production_order_code
                        AND i.inspection_type = 'FINAL' AND i.result = 'PASS');

    /* C11 - Rows sent to quarantine in this batch (review dq.rejected_rows) */
    INSERT INTO dq.check_result (run_id, check_code, check_name, severity, failed_rows)
    SELECT @run_id, 'C11', 'Rows quarantined during landing -> staging', 'WARNING', COUNT(*)
    FROM dq.rejected_rows
    WHERE batch_id = @batch_id;

    SELECT check_code, check_name, severity, failed_rows, status
    FROM dq.check_result
    WHERE run_id = @run_id
    ORDER BY check_code;
END;
GO
