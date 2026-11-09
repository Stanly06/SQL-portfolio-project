/* =====================================================================
   tests/test_stage2_expected_results.sql
   Automated tests for stages 1-2. Run AFTER sql/07_run_pipeline.sql.
   Every test compares an ACTUAL result with an EXPECTED value that was
   calculated by hand from the seed data (see docs/data_quality_catalog.md).
   If anything differs, the script stops with THROW and an explanation.
   At the end it leaves the database loaded with batch 1 again.
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

/* ---------------- Test 1: row counts per staging table ---------------- */
DECLARE @failures NVARCHAR(MAX);

WITH expected AS (
    SELECT * FROM (VALUES
        ('supplier', 4), ('material', 6), ('product', 3), ('bill_of_materials', 10),
        ('customer', 5), ('receipt_lot', 11), ('production_order', 10),
        ('quality_inspection', 20), ('sales_order', 10), ('sales_order_line', 15),
        ('inventory_movement', 54)
    ) AS e(entity, expected_rows)
),
actual AS (
    SELECT 'supplier' AS entity, COUNT(*) AS actual_rows FROM stg.supplier UNION ALL
    SELECT 'material',           COUNT(*) FROM stg.material UNION ALL
    SELECT 'product',            COUNT(*) FROM stg.product UNION ALL
    SELECT 'bill_of_materials',  COUNT(*) FROM stg.bill_of_materials UNION ALL
    SELECT 'customer',           COUNT(*) FROM stg.customer UNION ALL
    SELECT 'receipt_lot',        COUNT(*) FROM stg.receipt_lot UNION ALL
    SELECT 'production_order',   COUNT(*) FROM stg.production_order UNION ALL
    SELECT 'quality_inspection', COUNT(*) FROM stg.quality_inspection UNION ALL
    SELECT 'sales_order',        COUNT(*) FROM stg.sales_order UNION ALL
    SELECT 'sales_order_line',   COUNT(*) FROM stg.sales_order_line UNION ALL
    SELECT 'inventory_movement', COUNT(*) FROM stg.inventory_movement
)
SELECT @failures = STRING_AGG(CONCAT(e.entity, ' expected ', e.expected_rows, ' got ', COALESCE(a.actual_rows, -1)), '; ')
FROM expected e
LEFT JOIN actual a ON a.entity = e.entity
WHERE COALESCE(a.actual_rows, -1) <> e.expected_rows;

IF @failures IS NOT NULL THROW 50001, @failures, 1;
PRINT 'PASS  Test 1 - staging row counts';
GO

/* ---------------- Test 2: exactly the expected rows are quarantined ---- */
DECLARE @failures NVARCHAR(MAX);

WITH expected AS (
    SELECT * FROM (VALUES
        ('receipt_lot',        'LOT-2511'),
        ('receipt_lot',        'LOT-2512'),
        ('production_order',   'PO-1005'),
        ('quality_inspection', 'INS-021'),
        ('sales_order_line',   'SO-5005|1')
    ) AS e(entity, business_key)
),
actual AS (
    SELECT entity, business_key FROM dq.rejected_rows WHERE batch_id = 1
)
SELECT @failures = STRING_AGG(CONCAT(COALESCE(e.entity, a.entity), ':', COALESCE(e.business_key, a.business_key),
                              CASE WHEN a.entity IS NULL THEN ' (expected, not rejected)' ELSE ' (rejected, not expected)' END), '; ')
FROM expected e
FULL OUTER JOIN actual a ON a.entity = e.entity AND a.business_key = e.business_key
WHERE e.entity IS NULL OR a.entity IS NULL;

IF @failures IS NOT NULL THROW 50002, @failures, 1;
PRINT 'PASS  Test 2 - quarantined rows';
GO

/* ---------------- Test 3: cleaning rules applied correctly -------------- */
IF NOT EXISTS (SELECT 1 FROM stg.receipt_lot WHERE lot_code = 'LOT-2508' AND supplier_code = 'SUP-01')
    THROW 50003, 'LOT-2508: supplier code " sup-01 " was not normalized to SUP-01', 1;
IF NOT EXISTS (SELECT 1 FROM stg.receipt_lot WHERE lot_code = 'LOT-2509' AND received_date = '2025-02-15')
    THROW 50003, 'LOT-2509: date 15/02/2025 was not parsed as 2025-02-15', 1;
IF NOT EXISTS (SELECT 1 FROM stg.receipt_lot WHERE lot_code = 'LOT-2510' AND qty_received = 60 AND uom = 'kg' AND unit_cost = 5.3)
    THROW 50003, 'LOT-2510: 60000 g at 0.0053/g was not converted to 60 kg at 5.30/kg', 1;
IF (SELECT COUNT(*) FROM stg.customer WHERE customer_code = 'CUS-02') <> 1
    THROW 50003, 'CUS-02: duplicate customer was not removed', 1;
IF EXISTS (SELECT 1 FROM stg.quality_inspection WHERE result NOT IN ('PASS', 'FAIL') OR result COLLATE Latin1_General_CS_AS <> UPPER(result))
    THROW 50003, 'quality_inspection.result was not normalized to PASS/FAIL', 1;
PRINT 'PASS  Test 3 - cleaning rules';
GO

/* ---------------- Test 4: data quality check results ------------------- */
DECLARE @failures NVARCHAR(MAX);
DECLARE @run_id INT = (SELECT MAX(run_id) FROM dq.check_run WHERE batch_id = 1);

WITH expected AS (
    SELECT * FROM (VALUES
        ('C01', 0), ('C02', 1), ('C03', 0), ('C04', 1), ('C05', 0), ('C06', 1),
        ('C07', 1), ('C08', 1), ('C09', 1), ('C10', 0), ('C11', 5)
    ) AS e(check_code, expected_failed)
)
SELECT @failures = STRING_AGG(CONCAT(e.check_code, ' expected ', e.expected_failed, ' got ', COALESCE(r.failed_rows, -1)), '; ')
FROM expected e
LEFT JOIN dq.check_result r ON r.check_code = e.check_code AND r.run_id = @run_id
WHERE COALESCE(r.failed_rows, -1) <> e.expected_failed;

IF @failures IS NOT NULL THROW 50004, @failures, 1;
PRINT 'PASS  Test 4 - data quality check results';
GO

/* ---------------- Test 5: idempotency (re-running changes nothing) ------ */
DECLARE @before TABLE (entity VARCHAR(50), rows_loaded INT, rows_rejected INT);
INSERT INTO @before SELECT entity, rows_loaded, rows_rejected FROM etl.load_step_log WHERE batch_id = 1;

DECLARE @sink TABLE (entity VARCHAR(50), rows_read INT, rows_duplicate INT, rows_rejected INT, rows_loaded INT);
INSERT INTO @sink EXEC etl.usp_load_staging @batch_id = 1;   -- second run

IF EXISTS (
    SELECT entity, rows_loaded, rows_rejected FROM @before
    EXCEPT
    SELECT entity, rows_loaded, rows_rejected FROM etl.load_step_log WHERE batch_id = 1
) OR (SELECT COUNT(*) FROM dq.rejected_rows WHERE batch_id = 1) <> 5
    THROW 50005, 'Re-running the load changed the results: the load is NOT idempotent', 1;
PRINT 'PASS  Test 5 - idempotency';
GO

/* ---------------- Test 6: NULLs are rejected, not crashing the load ----- */
-- Each batch is a full snapshot, so batch 99 also needs the product it references.
DELETE FROM land.products            WHERE _batch_id = 99;
DELETE FROM land.production_orders   WHERE _batch_id = 99;
DELETE FROM land.quality_inspections WHERE _batch_id = 99;
INSERT INTO land.products (product_code, product_name, category, uom, list_price, _batch_id)
VALUES (N'FG-MINT', N'Mint Tea 20 bags', N'Herbal', N'box', N'3.50', 99);
INSERT INTO land.production_orders (production_order_code, product_code, line_code, planned_date, planned_qty, status, _batch_id)
VALUES (N'PO-9999', N'FG-MINT', N'L1', N'2025-03-01', N'100', NULL, 99);          -- NULL status
INSERT INTO land.quality_inspections (inspection_code, inspection_type, lot_code, inspection_date, sample_size, defects_found, result, _batch_id)
VALUES (N'INS-999', NULL, N'LOT-2501', N'2025-03-01', N'10', N'0', NULL, 99);   -- NULL type and result

DECLARE @sink TABLE (entity VARCHAR(50), rows_read INT, rows_duplicate INT, rows_rejected INT, rows_loaded INT);
BEGIN TRY
    INSERT INTO @sink EXEC etl.usp_load_staging @batch_id = 99;
END TRY
BEGIN CATCH
    DECLARE @msg NVARCHAR(4000) = CONCAT('Load crashed on NULL values instead of quarantining them: ', ERROR_MESSAGE());
    THROW 50006, @msg, 1;
END CATCH;

IF (SELECT COUNT(*) FROM dq.rejected_rows WHERE batch_id = 99) <> 2
   OR NOT EXISTS (SELECT 1 FROM dq.rejected_rows WHERE batch_id = 99 AND business_key = 'PO-9999' AND reject_reason = 'invalid status')
   OR NOT EXISTS (SELECT 1 FROM dq.rejected_rows WHERE batch_id = 99 AND business_key = 'INS-999' AND reject_reason = 'invalid inspection_type')
    THROW 50006, 'NULL values were not quarantined with the expected reasons', 1;

-- clean up and restore batch 1
DELETE FROM land.products            WHERE _batch_id = 99;
DELETE FROM land.production_orders   WHERE _batch_id = 99;
DELETE FROM land.quality_inspections WHERE _batch_id = 99;
DELETE FROM dq.rejected_rows         WHERE batch_id = 99;
DELETE FROM etl.load_step_log        WHERE batch_id = 99;
INSERT INTO @sink EXEC etl.usp_load_staging @batch_id = 1;
PRINT 'PASS  Test 6 - NULL safety';
GO

PRINT 'ALL STAGE 2 TESTS PASSED';
GO
