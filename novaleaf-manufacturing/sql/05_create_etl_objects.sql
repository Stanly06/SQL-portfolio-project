/* =====================================================================
   05_create_etl_objects.sql
   - etl.load_step_log   : one row per entity per load (row accounting)
   - dq.rejected_rows    : quarantine for rows that break a rule
   - etl.usp_load_staging: FULL REFRESH of staging from landing

   Pattern used for every entity:
     1) Read landing, normalize text (TRIM/UPPER) and convert types with
        TRY_CONVERT (returns NULL instead of failing).
     2) Remove duplicates with ROW_NUMBER() over the business key.
     3) Assign a reject_reason with CASE (NULL = valid row).
     4) Rejected rows -> dq.rejected_rows ; valid rows -> stg table.
     5) Log rows read / duplicates / rejected / loaded.
   Everything runs inside ONE transaction: either the whole staging layer
   is refreshed or nothing changes (all-or-nothing).
   Idempotency: staging is deleted and rebuilt each run, and quarantine
   rows for the same batch are replaced, so re-running gives the same result.
   NULL safety: "col NOT IN (...)" is UNKNOWN when col is NULL, so the
   checks use COALESCE(col, '') to make sure NULLs are rejected, not loaded.
   SUM() over zero rows returns NULL (not 0), so the row accounting uses
   COALESCE(SUM(...), 0) for batches where an entity has no rows.
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE etl.load_step_log (
    log_id          INT IDENTITY(1,1) CONSTRAINT pk_load_step_log PRIMARY KEY,
    batch_id        INT          NOT NULL,
    entity          VARCHAR(50)  NOT NULL,
    rows_read       INT          NOT NULL,
    rows_duplicate  INT          NOT NULL,
    rows_rejected   INT          NOT NULL,
    rows_loaded     INT          NOT NULL,
    logged_at       DATETIME2(0) NOT NULL CONSTRAINT df_load_step_log_at DEFAULT SYSDATETIME(),
    -- accounting rule: every landing row ends up in exactly one bucket
    CONSTRAINT ck_load_step_balance CHECK (rows_read = rows_duplicate + rows_rejected + rows_loaded)
);

CREATE TABLE dq.rejected_rows (
    rejected_id     INT IDENTITY(1,1) CONSTRAINT pk_rejected_rows PRIMARY KEY,
    batch_id        INT            NOT NULL,
    entity          VARCHAR(50)    NOT NULL,
    business_key    NVARCHAR(100)  NULL,
    reject_reason   VARCHAR(200)   NOT NULL,
    raw_record      NVARCHAR(MAX)  NOT NULL,   -- original landing row as JSON
    rejected_at     DATETIME2(0)   NOT NULL CONSTRAINT df_rejected_rows_at DEFAULT SYSDATETIME()
);
GO

CREATE OR ALTER PROCEDURE etl.usp_load_staging
    @batch_id INT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;   -- any runtime error rolls back the whole transaction

    BEGIN TRY
        BEGIN TRANSACTION;

        /* ---- 0) Clear staging (children first because of foreign keys) ---- */
        DELETE FROM stg.inventory_movement;
        DELETE FROM stg.sales_order_line;
        DELETE FROM stg.sales_order;
        DELETE FROM stg.quality_inspection;
        DELETE FROM stg.production_order;
        DELETE FROM stg.receipt_lot;
        DELETE FROM stg.customer;
        DELETE FROM stg.bill_of_materials;
        DELETE FROM stg.product;
        DELETE FROM stg.material;
        DELETE FROM stg.supplier;
        DELETE FROM dq.rejected_rows   WHERE batch_id = @batch_id;
        DELETE FROM etl.load_step_log  WHERE batch_id = @batch_id;

        /* =================================================================
           SUPPLIERS
           ================================================================= */
        DROP TABLE IF EXISTS #supplier;
        SELECT  supplier_code  = UPPER(TRIM(l.supplier_code)),
                supplier_name  = TRIM(l.supplier_name),
                country        = TRIM(l.country),
                lead_time_days = TRY_CONVERT(INT, l.lead_time_days),
                is_active      = CASE UPPER(TRIM(l.is_active)) WHEN 'Y' THEN 1 WHEN 'N' THEN 0 END,
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.supplier_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.supplier_code, l.supplier_name, l.country, l.lead_time_days, l.is_active
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #supplier
        FROM    land.suppliers AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE #supplier SET reject_reason =
            CASE WHEN supplier_code IS NULL OR supplier_code = '' THEN 'missing supplier_code'
                 WHEN supplier_name IS NULL OR supplier_name = '' THEN 'missing supplier_name'
                 WHEN country IS NULL OR country = ''             THEN 'missing country'
                 WHEN lead_time_days IS NULL OR lead_time_days < 0 THEN 'invalid lead_time_days'
                 WHEN is_active IS NULL                            THEN 'invalid is_active (expected Y/N)'
            END
        WHERE rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'supplier', supplier_code, reject_reason, raw_record
        FROM #supplier WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.supplier (supplier_code, supplier_name, country, lead_time_days, is_active)
        SELECT supplier_code, supplier_name, country, lead_time_days, is_active
        FROM #supplier WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'supplier', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #supplier;

        /* =================================================================
           MATERIALS
           ================================================================= */
        DROP TABLE IF EXISTS #material;
        SELECT  material_code  = UPPER(TRIM(l.material_code)),
                material_name  = TRIM(l.material_name),
                material_type  = UPPER(TRIM(l.material_type)),
                uom            = LOWER(TRIM(l.uom)),
                standard_cost  = TRY_CONVERT(DECIMAL(12,4), l.standard_cost),
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.material_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.material_code, l.material_name, l.material_type, l.uom, l.standard_cost
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #material
        FROM    land.materials AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE #material SET reject_reason =
            CASE WHEN material_code IS NULL OR material_code = ''       THEN 'missing material_code'
                 WHEN material_name IS NULL OR material_name = ''       THEN 'missing material_name'
                 WHEN COALESCE(material_type, '') NOT IN ('RAW', 'PACKAGING') THEN 'invalid material_type'
                 WHEN COALESCE(uom, '') NOT IN ('kg', 'unit')           THEN 'invalid uom for material'
                 WHEN standard_cost IS NULL OR standard_cost < 0         THEN 'invalid standard_cost'
            END
        WHERE rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'material', material_code, reject_reason, raw_record
        FROM #material WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.material (material_code, material_name, material_type, uom, standard_cost)
        SELECT material_code, material_name, material_type, uom, standard_cost
        FROM #material WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'material', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #material;

        /* =================================================================
           PRODUCTS
           ================================================================= */
        DROP TABLE IF EXISTS #product;
        SELECT  product_code   = UPPER(TRIM(l.product_code)),
                product_name   = TRIM(l.product_name),
                category       = TRIM(l.category),
                uom            = LOWER(TRIM(l.uom)),
                list_price     = TRY_CONVERT(DECIMAL(10,2), l.list_price),
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.product_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.product_code, l.product_name, l.category, l.uom, l.list_price
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #product
        FROM    land.products AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE #product SET reject_reason =
            CASE WHEN product_code IS NULL OR product_code = ''  THEN 'missing product_code'
                 WHEN product_name IS NULL OR product_name = ''   THEN 'missing product_name'
                 WHEN category IS NULL OR category = ''           THEN 'missing category'
                 WHEN COALESCE(uom, '') <> 'box'                  THEN 'invalid uom for product (expected box)'
                 WHEN list_price IS NULL OR list_price < 0        THEN 'invalid list_price'
            END
        WHERE rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'product', product_code, reject_reason, raw_record
        FROM #product WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.product (product_code, product_name, category, uom, list_price)
        SELECT product_code, product_name, category, uom, list_price
        FROM #product WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'product', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #product;

        /* =================================================================
           BILL OF MATERIALS
           ================================================================= */
        DROP TABLE IF EXISTS #bom;
        SELECT  product_code   = UPPER(TRIM(l.product_code)),
                material_code  = UPPER(TRIM(l.material_code)),
                qty_per_unit   = TRY_CONVERT(DECIMAL(12,4), l.qty_per_unit),
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.product_code)), UPPER(TRIM(l.material_code))
                                                    ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.product_code, l.material_code, l.qty_per_unit
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #bom
        FROM    land.bill_of_materials AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE b SET reject_reason =
            CASE WHEN NOT EXISTS (SELECT 1 FROM stg.product  p WHERE p.product_code  = b.product_code)  THEN 'unknown product_code'
                 WHEN NOT EXISTS (SELECT 1 FROM stg.material m WHERE m.material_code = b.material_code) THEN 'unknown material_code'
                 WHEN b.qty_per_unit IS NULL OR b.qty_per_unit <= 0                                     THEN 'invalid qty_per_unit'
            END
        FROM #bom AS b
        WHERE b.rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'bill_of_materials', CONCAT(product_code, '|', material_code), reject_reason, raw_record
        FROM #bom WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.bill_of_materials (product_code, material_code, qty_per_unit)
        SELECT product_code, material_code, qty_per_unit
        FROM #bom WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'bill_of_materials', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #bom;

        /* =================================================================
           CUSTOMERS
           ================================================================= */
        DROP TABLE IF EXISTS #customer;
        SELECT  customer_code  = UPPER(TRIM(l.customer_code)),
                customer_name  = TRIM(l.customer_name),
                country        = TRIM(l.country),
                channel        = TRIM(l.channel),
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.customer_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.customer_code, l.customer_name, l.country, l.channel
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #customer
        FROM    land.customers AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE #customer SET reject_reason =
            CASE WHEN customer_code IS NULL OR customer_code = ''          THEN 'missing customer_code'
                 WHEN customer_name IS NULL OR customer_name = ''           THEN 'missing customer_name'
                 WHEN country IS NULL OR country = ''                       THEN 'missing country'
                 WHEN COALESCE(channel, '') NOT IN ('Retail', 'Distributor', 'Online') THEN 'invalid channel'
            END
        WHERE rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'customer', customer_code, reject_reason, raw_record
        FROM #customer WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.customer (customer_code, customer_name, country, channel)
        SELECT customer_code, customer_name, country, channel
        FROM #customer WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'customer', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #customer;

        /* =================================================================
           RECEIPT LOTS
           - dates: accepts yyyy-mm-dd (style 23) and dd/mm/yyyy (style 103)
           - grams are converted to kg when the material is managed in kg
           ================================================================= */
        DROP TABLE IF EXISTS #lot;
        SELECT  lot_code       = UPPER(TRIM(l.lot_code)),
                supplier_code  = UPPER(TRIM(l.supplier_code)),
                material_code  = UPPER(TRIM(l.material_code)),
                received_date  = COALESCE(TRY_CONVERT(DATE, l.received_date, 23), TRY_CONVERT(DATE, l.received_date, 103)),
                expiry_date    = COALESCE(TRY_CONVERT(DATE, l.expiry_date, 23),   TRY_CONVERT(DATE, l.expiry_date, 103)),
                qty_raw        = TRY_CONVERT(DECIMAL(14,3), l.qty_received),
                cost_raw       = TRY_CONVERT(DECIMAL(12,6), l.unit_cost),
                uom_raw        = LOWER(TRIM(l.uom)),
                expiry_text    = l.expiry_date,
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.lot_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.lot_code, l.supplier_code, l.material_code, l.received_date, l.qty_received,
                                         l.uom, l.unit_cost, l.expiry_date
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                material_uom   = CAST(NULL AS VARCHAR(10)),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #lot
        FROM    land.receipt_lots AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET material_uom = m.uom
        FROM #lot AS x JOIN stg.material AS m ON m.material_code = x.material_code;

        UPDATE x SET reject_reason =
            CASE WHEN NOT EXISTS (SELECT 1 FROM stg.supplier s WHERE s.supplier_code = x.supplier_code) THEN 'unknown supplier_code'
                 WHEN x.material_uom IS NULL                                   THEN 'unknown material_code'
                 WHEN x.received_date IS NULL                                  THEN 'invalid received_date'
                 WHEN x.expiry_text IS NOT NULL AND x.expiry_date IS NULL      THEN 'invalid expiry_date'
                 WHEN x.qty_raw IS NULL OR x.qty_raw <= 0                      THEN 'quantity must be > 0'
                 WHEN x.cost_raw IS NULL OR x.cost_raw < 0                     THEN 'invalid unit_cost'
                 WHEN x.uom_raw IS NULL                                        THEN 'missing uom'
                 WHEN NOT (x.uom_raw = x.material_uom OR (x.uom_raw = 'g' AND x.material_uom = 'kg'))
                                                                               THEN 'uom not compatible with material'
            END
        FROM #lot AS x
        WHERE x.rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'receipt_lot', lot_code, reject_reason, raw_record
        FROM #lot WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.receipt_lot (lot_code, supplier_code, material_code, received_date, qty_received, uom, unit_cost, expiry_date)
        SELECT lot_code, supplier_code, material_code, received_date,
               CASE WHEN uom_raw = 'g' THEN qty_raw / 1000.0  ELSE qty_raw  END,   -- g  -> kg
               material_uom,
               CASE WHEN uom_raw = 'g' THEN cost_raw * 1000.0 ELSE cost_raw END,  -- $/g -> $/kg
               expiry_date
        FROM #lot WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'receipt_lot', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #lot;

        /* =================================================================
           PRODUCTION ORDERS
           ================================================================= */
        DROP TABLE IF EXISTS #po;
        SELECT  production_order_code = UPPER(TRIM(l.production_order_code)),
                product_code   = UPPER(TRIM(l.product_code)),
                line_code      = UPPER(TRIM(l.line_code)),
                planned_date   = TRY_CONVERT(DATE, l.planned_date, 23),
                start_ts       = TRY_CONVERT(DATETIME2(0), l.start_ts),
                end_ts         = TRY_CONVERT(DATETIME2(0), l.end_ts),
                planned_qty    = TRY_CONVERT(INT, l.planned_qty),
                produced_qty   = TRY_CONVERT(INT, l.produced_qty),
                scrap_qty      = TRY_CONVERT(INT, l.scrap_qty),
                status         = UPPER(TRIM(l.status)),
                rn             = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.production_order_code)) ORDER BY l._loaded_at DESC),
                raw_record     = (SELECT l.production_order_code, l.product_code, l.line_code, l.planned_date, l.start_ts,
                                         l.end_ts, l.planned_qty, l.produced_qty, l.scrap_qty, l.status
                                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason  = CAST(NULL AS VARCHAR(200))
        INTO    #po
        FROM    land.production_orders AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET reject_reason =
            CASE WHEN NOT EXISTS (SELECT 1 FROM stg.product p WHERE p.product_code = x.product_code) THEN 'unknown product_code'
                 WHEN x.planned_date IS NULL                                     THEN 'invalid planned_date'
                 WHEN x.planned_qty IS NULL OR x.planned_qty <= 0                THEN 'invalid planned_qty'
                 WHEN x.line_code IS NULL OR x.line_code = ''                    THEN 'missing line_code'
                 WHEN COALESCE(x.status, '') NOT IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') THEN 'invalid status'
                 WHEN x.status = 'COMPLETED' AND x.produced_qty IS NULL          THEN 'COMPLETED order without produced_qty'
                 WHEN x.produced_qty < 0 OR x.scrap_qty < 0                      THEN 'negative produced/scrap qty'
            END
        FROM #po AS x
        WHERE x.rn = 1;
        -- NOTE: end_ts < start_ts is NOT rejected here; it is reported as a
        -- WARNING by the data quality checks (the rest of the row is usable).

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'production_order', production_order_code, reject_reason, raw_record
        FROM #po WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.production_order (production_order_code, product_code, line_code, planned_date, start_ts, end_ts,
                                          planned_qty, produced_qty, scrap_qty, status)
        SELECT production_order_code, product_code, line_code, planned_date, start_ts, end_ts,
               planned_qty, produced_qty, scrap_qty, status
        FROM #po WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'production_order', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #po;

        /* =================================================================
           QUALITY INSPECTIONS
           ================================================================= */
        DROP TABLE IF EXISTS #insp;
        SELECT  inspection_code = UPPER(TRIM(l.inspection_code)),
                inspection_type = UPPER(TRIM(l.inspection_type)),
                lot_code        = NULLIF(UPPER(TRIM(l.lot_code)), ''),
                production_order_code = NULLIF(UPPER(TRIM(l.production_order_code)), ''),
                inspection_date = TRY_CONVERT(DATE, l.inspection_date, 23),
                sample_size     = TRY_CONVERT(INT, l.sample_size),
                defects_found   = TRY_CONVERT(INT, l.defects_found),
                result          = UPPER(TRIM(l.result)),
                rn              = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.inspection_code)) ORDER BY l._loaded_at DESC),
                raw_record      = (SELECT l.inspection_code, l.inspection_type, l.lot_code, l.production_order_code,
                                          l.inspection_date, l.sample_size, l.defects_found, l.result
                                   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason   = CAST(NULL AS VARCHAR(200))
        INTO    #insp
        FROM    land.quality_inspections AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET reject_reason =
            CASE WHEN COALESCE(x.inspection_type, '') NOT IN ('INCOMING', 'FINAL')        THEN 'invalid inspection_type'
                 WHEN x.inspection_type = 'INCOMING' AND (x.lot_code IS NULL OR x.production_order_code IS NOT NULL)
                                                                                         THEN 'INCOMING inspection must reference only a lot'
                 WHEN x.inspection_type = 'FINAL' AND (x.production_order_code IS NULL OR x.lot_code IS NOT NULL)
                                                                                         THEN 'FINAL inspection must reference only a production order'
                 WHEN x.lot_code IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM stg.receipt_lot r WHERE r.lot_code = x.lot_code)  THEN 'unknown or rejected lot_code'
                 WHEN x.production_order_code IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM stg.production_order p WHERE p.production_order_code = x.production_order_code)
                                                                                         THEN 'unknown or rejected production_order_code'
                 WHEN x.inspection_date IS NULL                                         THEN 'invalid inspection_date'
                 WHEN x.sample_size IS NULL OR x.sample_size <= 0                        THEN 'invalid sample_size'
                 WHEN x.defects_found IS NULL OR x.defects_found < 0
                      OR x.defects_found > x.sample_size                                 THEN 'invalid defects_found'
                 WHEN COALESCE(x.result, '') NOT IN ('PASS', 'FAIL')                     THEN 'invalid result'
            END
        FROM #insp AS x
        WHERE x.rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'quality_inspection', inspection_code, reject_reason, raw_record
        FROM #insp WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.quality_inspection (inspection_code, inspection_type, lot_code, production_order_code,
                                            inspection_date, sample_size, defects_found, result)
        SELECT inspection_code, inspection_type, lot_code, production_order_code,
               inspection_date, sample_size, defects_found, result
        FROM #insp WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'quality_inspection', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #insp;

        /* =================================================================
           SALES ORDERS (header)
           ================================================================= */
        DROP TABLE IF EXISTS #so;
        SELECT  sales_order_code = UPPER(TRIM(l.sales_order_code)),
                customer_code    = UPPER(TRIM(l.customer_code)),
                order_date       = TRY_CONVERT(DATE, l.order_date, 23),
                ship_date        = TRY_CONVERT(DATE, l.ship_date, 23),
                ship_text        = l.ship_date,
                status           = UPPER(TRIM(l.status)),
                rn               = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.sales_order_code)) ORDER BY l._loaded_at DESC),
                raw_record       = (SELECT l.sales_order_code, l.customer_code, l.order_date, l.ship_date, l.status
                                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason    = CAST(NULL AS VARCHAR(200))
        INTO    #so
        FROM    land.sales_orders AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET reject_reason =
            CASE WHEN NOT EXISTS (SELECT 1 FROM stg.customer c WHERE c.customer_code = x.customer_code) THEN 'unknown customer_code'
                 WHEN x.order_date IS NULL                                    THEN 'invalid order_date'
                 WHEN x.ship_text IS NOT NULL AND x.ship_date IS NULL         THEN 'invalid ship_date'
                 WHEN COALESCE(x.status, '') NOT IN ('OPEN', 'SHIPPED', 'CANCELLED') THEN 'invalid status'
            END
        FROM #so AS x
        WHERE x.rn = 1;
        -- NOTE: ship_date < order_date is reported as a WARNING by the DQ checks.

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'sales_order', sales_order_code, reject_reason, raw_record
        FROM #so WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.sales_order (sales_order_code, customer_code, order_date, ship_date, status)
        SELECT sales_order_code, customer_code, order_date, ship_date, status
        FROM #so WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'sales_order', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #so;

        /* =================================================================
           SALES ORDER LINES
           A discount above 1 (e.g. "10") is ambiguous (10% or 1000%?), so it
           is quarantined instead of being "fixed" silently.
           ================================================================= */
        DROP TABLE IF EXISTS #sol;
        SELECT  sales_order_code = UPPER(TRIM(l.sales_order_code)),
                line_no          = TRY_CONVERT(INT, l.line_no),
                product_code     = UPPER(TRIM(l.product_code)),
                qty              = TRY_CONVERT(INT, l.qty),
                unit_price       = TRY_CONVERT(DECIMAL(10,2), l.unit_price),
                discount_pct     = TRY_CONVERT(DECIMAL(9,4), COALESCE(NULLIF(TRIM(l.discount_pct), ''), '0')),
                rn               = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.sales_order_code)), TRY_CONVERT(INT, l.line_no)
                                                      ORDER BY l._loaded_at DESC),
                raw_record       = (SELECT l.sales_order_code, l.line_no, l.product_code, l.qty, l.unit_price, l.discount_pct
                                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                reject_reason    = CAST(NULL AS VARCHAR(200))
        INTO    #sol
        FROM    land.sales_order_lines AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET reject_reason =
            CASE WHEN NOT EXISTS (SELECT 1 FROM stg.sales_order s WHERE s.sales_order_code = x.sales_order_code) THEN 'unknown or rejected sales_order_code'
                 WHEN x.line_no IS NULL                                                                         THEN 'invalid line_no'
                 WHEN NOT EXISTS (SELECT 1 FROM stg.product p WHERE p.product_code = x.product_code)            THEN 'unknown product_code'
                 WHEN x.qty IS NULL OR x.qty <= 0                                                               THEN 'quantity must be > 0'
                 WHEN x.unit_price IS NULL OR x.unit_price < 0                                                  THEN 'invalid unit_price'
                 WHEN x.discount_pct IS NULL OR x.discount_pct < 0 OR x.discount_pct > 1                        THEN 'discount_pct outside 0-1 (ambiguous format)'
            END
        FROM #sol AS x
        WHERE x.rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'sales_order_line', CONCAT(sales_order_code, '|', line_no), reject_reason, raw_record
        FROM #sol WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.sales_order_line (sales_order_code, line_no, product_code, qty, unit_price, discount_pct)
        SELECT sales_order_code, line_no, product_code, qty, unit_price, discount_pct
        FROM #sol WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'sales_order_line', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #sol;

        /* =================================================================
           INVENTORY MOVEMENTS
           item_code must exist as a material OR a product, and the uom must
           match that item's uom.
           ================================================================= */
        DROP TABLE IF EXISTS #mv;
        SELECT  movement_code   = UPPER(TRIM(l.movement_code)),
                movement_ts     = TRY_CONVERT(DATETIME2(0), l.movement_ts),
                movement_type   = UPPER(TRIM(l.movement_type)),
                item_code       = UPPER(TRIM(l.item_code)),
                lot_code        = NULLIF(UPPER(TRIM(l.lot_code)), ''),
                production_order_code = NULLIF(UPPER(TRIM(l.production_order_code)), ''),
                sales_order_code = NULLIF(UPPER(TRIM(l.sales_order_code)), ''),
                qty             = TRY_CONVERT(DECIMAL(14,3), l.qty),
                uom             = LOWER(TRIM(l.uom)),
                rn              = ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(l.movement_code)) ORDER BY l._loaded_at DESC),
                raw_record      = (SELECT l.movement_code, l.movement_ts, l.movement_type, l.item_code, l.lot_code,
                                          l.production_order_code, l.sales_order_code, l.qty, l.uom
                                   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
                item_uom        = CAST(NULL AS VARCHAR(10)),
                reject_reason   = CAST(NULL AS VARCHAR(200))
        INTO    #mv
        FROM    land.inventory_movements AS l
        WHERE   l._batch_id = @batch_id;

        UPDATE x SET item_uom = COALESCE(m.uom, p.uom)
        FROM #mv AS x
        LEFT JOIN stg.material AS m ON m.material_code = x.item_code
        LEFT JOIN stg.product  AS p ON p.product_code  = x.item_code;

        UPDATE x SET reject_reason =
            CASE WHEN x.movement_ts IS NULL                                     THEN 'invalid movement_ts'
                 WHEN COALESCE(x.movement_type, '') NOT IN ('RECEIPT', 'ISSUE_TO_PRODUCTION', 'PRODUCTION_OUTPUT',
                                              'SALE_SHIPMENT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN 'invalid movement_type'
                 WHEN x.item_uom IS NULL                                        THEN 'unknown item_code'
                 WHEN COALESCE(x.uom, '') <> x.item_uom                         THEN 'uom does not match item uom'
                 WHEN x.qty IS NULL OR x.qty <= 0                               THEN 'quantity must be > 0'
                 WHEN x.lot_code IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM stg.receipt_lot r WHERE r.lot_code = x.lot_code) THEN 'unknown or rejected lot_code'
                 WHEN x.production_order_code IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM stg.production_order p WHERE p.production_order_code = x.production_order_code)
                                                                                THEN 'unknown or rejected production_order_code'
                 WHEN x.sales_order_code IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM stg.sales_order s WHERE s.sales_order_code = x.sales_order_code)
                                                                                THEN 'unknown or rejected sales_order_code'
            END
        FROM #mv AS x
        WHERE x.rn = 1;

        INSERT INTO dq.rejected_rows (batch_id, entity, business_key, reject_reason, raw_record)
        SELECT @batch_id, 'inventory_movement', movement_code, reject_reason, raw_record
        FROM #mv WHERE rn = 1 AND reject_reason IS NOT NULL;

        INSERT INTO stg.inventory_movement (movement_code, movement_ts, movement_type, item_code, lot_code,
                                            production_order_code, sales_order_code, qty, uom)
        SELECT movement_code, movement_ts, movement_type, item_code, lot_code,
               production_order_code, sales_order_code, qty, uom
        FROM #mv WHERE rn = 1 AND reject_reason IS NULL;

        INSERT INTO etl.load_step_log (batch_id, entity, rows_read, rows_duplicate, rows_rejected, rows_loaded)
        SELECT @batch_id, 'inventory_movement', COUNT(*),
               COALESCE(SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NOT NULL THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN rn = 1 AND reject_reason IS NULL THEN 1 ELSE 0 END), 0)
        FROM #mv;

        COMMIT TRANSACTION;

        SELECT entity, rows_read, rows_duplicate, rows_rejected, rows_loaded
        FROM etl.load_step_log
        WHERE batch_id = @batch_id
        ORDER BY log_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;   -- re-raise the original error to the caller
    END CATCH;
END;
GO
