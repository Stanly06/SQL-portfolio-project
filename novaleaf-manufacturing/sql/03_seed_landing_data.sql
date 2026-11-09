/* =====================================================================
   03_seed_landing_data.sql
   FICTIONAL data for NovaLeaf Manufacturing, a small producer of herbal
   tea boxes (20 tea bags per box). Period: January - March 2025.
   The dataset is intentionally SMALL so every result can be checked by
   hand. It contains data quality problems ON PURPOSE; each one is marked
   with a code (DQ-xx) documented in docs/data_quality_catalog.md.
   Re-running this script reloads batch 1 from scratch (idempotent).
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;

DELETE FROM land.suppliers           WHERE _batch_id = 1;
DELETE FROM land.materials           WHERE _batch_id = 1;
DELETE FROM land.products            WHERE _batch_id = 1;
DELETE FROM land.bill_of_materials   WHERE _batch_id = 1;
DELETE FROM land.customers           WHERE _batch_id = 1;
DELETE FROM land.receipt_lots        WHERE _batch_id = 1;
DELETE FROM land.production_orders   WHERE _batch_id = 1;
DELETE FROM land.quality_inspections WHERE _batch_id = 1;
DELETE FROM land.sales_orders        WHERE _batch_id = 1;
DELETE FROM land.sales_order_lines   WHERE _batch_id = 1;
DELETE FROM land.inventory_movements WHERE _batch_id = 1;

/* ---------------------------- Suppliers ---------------------------- */
INSERT INTO land.suppliers (supplier_code, supplier_name, country, lead_time_days, is_active, _batch_id) VALUES
 (N'SUP-01', N'Hojas del Valle SRL',      N'Dominican Republic', N'7',  N'Y', 1),
 (N'SUP-02', N'AgroAndes Export',         N'Peru',               N'21', N'Y', 1),
 (N'SUP-03', N'Empaques Caribe SA',       N'Dominican Republic', N'5',  N'Y', 1),
 (N'SUP-04', N'Spice Route Trading',      N'India',              N'45', N'N', 1);

/* ----------------------- Materials (raw + packaging) ---------------- */
-- standard_cost is USD per unit of measure (per kg or per unit)
INSERT INTO land.materials (material_code, material_name, material_type, uom, standard_cost, _batch_id) VALUES
 (N'RM-MINT', N'Dried mint leaf',             N'RAW',       N'kg',   N'6.50',  1),
 (N'RM-CHAM', N'Dried chamomile flower',      N'RAW',       N'kg',   N'9.00',  1),
 (N'RM-GING', N'Dehydrated ginger',           N'RAW',       N'kg',   N'5.20',  1),
 (N'RM-LEMN', N'Dehydrated lemon peel',       N'RAW',       N'kg',   N'4.80',  1),
 (N'PK-BAG',  N'Filter tea bag',              N'PACKAGING', N'unit', N'0.010', 1),
 (N'PK-BOX',  N'Printed box (20 bags)',       N'PACKAGING', N'unit', N'0.150', 1);

/* ----------------------------- Products ----------------------------- */
-- list_price is USD per box
INSERT INTO land.products (product_code, product_name, category, uom, list_price, _batch_id) VALUES
 (N'FG-MINT', N'Mint Tea 20 bags',          N'Herbal', N'box', N'3.50', 1),
 (N'FG-CHAM', N'Chamomile Tea 20 bags',     N'Herbal', N'box', N'3.80', 1),
 (N'FG-GILE', N'Ginger-Lemon Tea 20 bags',  N'Blend',  N'box', N'4.20', 1);

/* ------------------- Bill of materials (per 1 box) ------------------ */
-- 20 bags x 1.5 g = 0.030 kg of leaf per box
INSERT INTO land.bill_of_materials (product_code, material_code, qty_per_unit, _batch_id) VALUES
 (N'FG-MINT', N'RM-MINT', N'0.030', 1), (N'FG-MINT', N'PK-BAG', N'20', 1), (N'FG-MINT', N'PK-BOX', N'1', 1),
 (N'FG-CHAM', N'RM-CHAM', N'0.030', 1), (N'FG-CHAM', N'PK-BAG', N'20', 1), (N'FG-CHAM', N'PK-BOX', N'1', 1),
 (N'FG-GILE', N'RM-GING', N'0.020', 1), (N'FG-GILE', N'RM-LEMN', N'0.010', 1),
 (N'FG-GILE', N'PK-BAG',  N'20',    1), (N'FG-GILE', N'PK-BOX',  N'1',     1);

/* ----------------------------- Customers ---------------------------- */
INSERT INTO land.customers (customer_code, customer_name, country, channel, _batch_id) VALUES
 (N'CUS-01', N'Supermercado El Faro',    N'Dominican Republic', N'Retail',      1),
 (N'CUS-02', N'Distribuidora Ambar',     N'Dominican Republic', N'Distributor', 1),
 (N'CUS-03', N'Farmacia Vida Natural',   N'Dominican Republic', N'Retail',      1),
 (N'CUS-04', N'GreenCart Online',        N'United States',      N'Online',      1),
 (N'CUS-05', N'Tienda Organica Sol',     N'Puerto Rico',        N'Retail',      1),
 (N'CUS-02', N'Distribuidora Ambar',     N'Dominican Republic', N'Distributor', 1);   -- DQ-01 exact duplicate

/* ------------------- Receipt lots (raw material lots) --------------- */
INSERT INTO land.receipt_lots (lot_code, supplier_code, material_code, received_date, qty_received, uom, unit_cost, expiry_date, _batch_id) VALUES
 (N'LOT-2501', N'SUP-01',   N'RM-MINT', N'2025-01-06', N'200',    N'kg',   N'6.40',   N'2026-01-06', 1),
 (N'LOT-2502', N'SUP-02',   N'RM-CHAM', N'2025-01-08', N'150',    N'kg',   N'9.10',   N'2026-01-08', 1),
 (N'LOT-2503', N'SUP-03',   N'PK-BAG',  N'2025-01-09', N'200000', N'unit', N'0.010',  NULL,          1),
 (N'LOT-2504', N'SUP-03',   N'PK-BOX',  N'2025-01-09', N'12000',  N'unit', N'0.150',  NULL,          1),
 (N'LOT-2505', N'SUP-02',   N'RM-GING', N'2025-01-15', N'80',     N'kg',   N'5.30',   N'2025-12-15', 1),
 (N'LOT-2506', N'SUP-02',   N'RM-LEMN', N'2025-01-15', N'40',     N'kg',   N'4.70',   N'2025-12-15', 1),
 (N'LOT-2507', N'SUP-01',   N'RM-MINT', N'2025-02-03', N'180',    N'kg',   N'6.60',   N'2026-02-03', 1),  -- fails incoming inspection
 (N'LOT-2508', N' sup-01 ', N'RM-MINT', N'2025-02-10', N'200',    N'kg',   N'6.55',   N'2026-02-10', 1),  -- DQ-02 code with spaces/lowercase
 (N'LOT-2509', N'SUP-02',   N'RM-CHAM', N'15/02/2025', N'120',    N'kg',   N'9.05',   N'15/02/2026', 1),  -- DQ-03 dd/mm/yyyy date format
 (N'LOT-2510', N'SUP-02',   N'RM-GING', N'2025-02-20', N'60000',  N'g',    N'0.0053', N'2026-02-20', 1),  -- DQ-04 grams instead of kg
 (N'LOT-2511', N'SUP-99',   N'RM-LEMN', N'2025-03-03', N'30',     N'kg',   N'4.75',   N'2026-03-03', 1),  -- DQ-05 unknown supplier
 (N'LOT-2512', N'SUP-03',   N'PK-BAG',  N'2025-03-05', N'-50000', N'unit', N'0.010',  NULL,          1),  -- DQ-06 negative quantity
 (N'LOT-2513', N'SUP-03',   N'PK-BAG',  N'2025-03-06', N'100000', N'unit', N'0.010',  NULL,          1),  -- DQ-14 receipt movement missing
 (N'LOT-2501', N'SUP-01',   N'RM-MINT', N'2025-01-06', N'200',    N'kg',   N'6.40',   N'2026-01-06', 1);  -- DQ-01 exact duplicate

/* ------------------------ Production orders ------------------------ */
-- quantities are in boxes
INSERT INTO land.production_orders (production_order_code, product_code, line_code, planned_date, start_ts, end_ts, planned_qty, produced_qty, scrap_qty, status, _batch_id) VALUES
 (N'PO-1001', N'FG-MINT', N'L1', N'2025-01-13', N'2025-01-13 06:00', N'2025-01-13 14:00', N'2000', N'1950', N'40', N'COMPLETED',   1),
 (N'PO-1002', N'FG-CHAM', N'L2', N'2025-01-14', N'2025-01-14 06:00', N'2025-01-14 13:00', N'1500', N'1500', N'20', N'COMPLETED',   1),
 (N'PO-1003', N'FG-GILE', N'L1', N'2025-01-20', N'2025-01-20 06:00', N'2025-01-20 12:30', N'1000', N'940',  N'60', N'COMPLETED',   1),
 (N'PO-1004', N'FG-MINT', N'L1', N'2025-02-05', N'2025-02-05 06:00', N'2025-02-05 14:30', N'2000', N'2010', N'30', N'COMPLETED',   1),
 (N'PO-1005', N'FG-CHAM', N'L2', N'2025-02-12', N'2025-02-12 06:00', N'2025-02-12 13:00', N'1500', NULL,    NULL,  N'COMPLETED',   1),  -- DQ-07 completed without output
 (N'PO-1006', N'FG-MINT', N'L1', N'2025-02-18', N'2025-02-18 14:00', N'2025-02-18 06:00', N'2000', N'1980', N'25', N'completed',   1),  -- DQ-08 end before start; DQ-09 casing
 (N'PO-1007', N'FG-GILE', N'L2', N'2025-03-04', N'2025-03-04 06:00', N'2025-03-04 13:00', N'1200', N'1150', N'45', N'COMPLETED',   1),
 (N'PO-1008', N'FG-CHAM', N'L2', N'2025-03-10', N'2025-03-10 06:00', N'2025-03-10 13:00', N'1500', N'1470', N'20', N'COMPLETED',   1),
 (N'PO-1009', N'FG-MINT', N'L1', N'2025-03-24', N'2025-03-24 06:00', NULL,                N'2000', NULL,    NULL,  N'IN_PROGRESS', 1),
 (N'PO-1010', N'FG-GILE', N'L1', N'2025-03-28', NULL,                NULL,                N'1000', NULL,    NULL,  N'PLANNED',     1),
 (N'PO-1011', N'FG-CHAM', N'L2', N'2025-03-17', NULL,                NULL,                N'1000', N'0',    N'0',  N'CANCELLED',   1);

/* ------------------------ Quality inspections ----------------------- */
-- INCOMING = inspection of a received lot; FINAL = inspection of a production order
INSERT INTO land.quality_inspections (inspection_code, inspection_type, lot_code, production_order_code, inspection_date, sample_size, defects_found, result, _batch_id) VALUES
 (N'INS-001', N'INCOMING', N'LOT-2501', NULL,      N'2025-01-06', N'20',  N'0', N'PASS',  1),
 (N'INS-002', N'INCOMING', N'LOT-2502', NULL,      N'2025-01-08', N'20',  N'1', N'Pass',  1),  -- DQ-09 casing
 (N'INS-003', N'INCOMING', N'LOT-2503', NULL,      N'2025-01-09', N'200', N'2', N'PASS',  1),
 (N'INS-004', N'INCOMING', N'LOT-2504', NULL,      N'2025-01-09', N'50',  N'0', N'PASS',  1),
 (N'INS-005', N'INCOMING', N'LOT-2505', NULL,      N'2025-01-15', N'20',  N'0', N'PASS ', 1),  -- DQ-09 trailing space
 (N'INS-006', N'INCOMING', N'LOT-2506', NULL,      N'2025-01-15', N'20',  N'0', N'PASS',  1),
 (N'INS-007', N'INCOMING', N'LOT-2507', NULL,      N'2025-02-03', N'20',  N'6', N'FAIL',  1),  -- lot rejected (moisture)
 (N'INS-008', N'INCOMING', N'LOT-2508', NULL,      N'2025-02-10', N'20',  N'3', N'FAIL',  1),  -- DQ-10 re-inspection: first FAIL...
 (N'INS-009', N'INCOMING', N'LOT-2508', NULL,      N'2025-02-11', N'20',  N'0', N'PASS',  1),  -- ...then PASS
 (N'INS-010', N'INCOMING', N'LOT-2509', NULL,      N'2025-02-15', N'20',  N'0', N'PASS',  1),
 (N'INS-011', N'INCOMING', N'LOT-2510', NULL,      N'2025-02-20', N'20',  N'1', N'PASS',  1),
 (N'INS-012', N'INCOMING', N'LOT-2513', NULL,      N'2025-03-06', N'200', N'1', N'PASS',  1),
 (N'INS-013', N'FINAL',    NULL,       N'PO-1001', N'2025-01-13', N'100', N'1', N'PASS',  1),
 (N'INS-014', N'FINAL',    NULL,       N'PO-1002', N'2025-01-14', N'100', N'0', N'PASS',  1),
 (N'INS-015', N'FINAL',    NULL,       N'PO-1003', N'2025-01-20', N'100', N'4', N'FAIL',  1),  -- DQ-10 first-pass fail...
 (N'INS-016', N'FINAL',    NULL,       N'PO-1003', N'2025-01-21', N'100', N'1', N'PASS',  1),  -- ...passes after rework
 (N'INS-017', N'FINAL',    NULL,       N'PO-1004', N'2025-02-05', N'100', N'2', N'PASS',  1),
 (N'INS-018', N'FINAL',    NULL,       N'PO-1006', N'2025-02-18', N'100', N'0', N'PASS',  1),
 (N'INS-019', N'FINAL',    NULL,       N'PO-1007', N'2025-03-04', N'100', N'1', N'PASS',  1),
 (N'INS-020', N'FINAL',    NULL,       N'PO-1008', N'2025-03-10', N'100', N'0', N'PASS',  1),
 (N'INS-021', N'INCOMING', NULL,       NULL,      N'2025-03-12', N'20',  N'0', N'PASS',  1);  -- DQ-11 no lot / order reference

/* ---------------------------- Sales orders --------------------------- */
INSERT INTO land.sales_orders (sales_order_code, customer_code, order_date, ship_date, status, _batch_id) VALUES
 (N'SO-5001', N'CUS-01', N'2025-01-16', N'2025-01-18', N'SHIPPED',   1),
 (N'SO-5002', N'CUS-02', N'2025-01-20', N'2025-01-22', N'SHIPPED',   1),
 (N'SO-5003', N'CUS-04', N'2025-01-25', N'2025-01-27', N'SHIPPED',   1),
 (N'SO-5004', N'CUS-03', N'2025-02-07', N'2025-02-08', N'SHIPPED',   1),
 (N'SO-5005', N'CUS-02', N'2025-02-10', N'2025-02-12', N'SHIPPED',   1),
 (N'SO-5006', N'CUS-05', N'2025-02-20', N'2025-02-15', N'SHIPPED',   1),  -- DQ-13 shipped before ordered
 (N'SO-5007', N'CUS-01', N'2025-03-05', N'2025-03-07', N'SHIPPED',   1),
 (N'SO-5008', N'CUS-04', N'2025-03-12', N'2025-03-14', N'SHIPPED',   1),
 (N'SO-5009', N'CUS-02', N'2025-03-20', NULL,          N'OPEN',      1),
 (N'SO-5010', N'CUS-03', N'2025-03-25', NULL,          N'CANCELLED', 1);

-- qty in boxes; unit_price in USD per box; discount_pct as a fraction (0.05 = 5%)
INSERT INTO land.sales_order_lines (sales_order_code, line_no, product_code, qty, unit_price, discount_pct, _batch_id) VALUES
 (N'SO-5001', N'1', N'FG-MINT', N'600',  N'3.50', N'0',    1),
 (N'SO-5001', N'2', N'FG-CHAM', N'400',  N'3.80', N'0',    1),
 (N'SO-5002', N'1', N'FG-MINT', N'1000', N'3.20', N'0.05', 1),
 (N'SO-5002', N'2', N'FG-CHAM', N'600',  N'3.50', N'0.05', 1),
 (N'SO-5002', N'3', N'FG-GILE', N'300',  N'3.90', N'0.05', 1),
 (N'SO-5003', N'1', N'FG-GILE', N'200',  N'4.20', N'0',    1),
 (N'SO-5004', N'1', N'FG-MINT', N'300',  N'3.50', N'0',    1),
 (N'SO-5004', N'2', N'FG-CHAM', N'200',  N'3.80', N'0',    1),
 (N'SO-5005', N'1', N'FG-MINT', N'1500', N'3.20', N'10',   1),  -- DQ-12 discount "10": 10% or 1000%? ambiguous
 (N'SO-5006', N'1', N'FG-GILE', N'250',  N'4.20', N'0',    1),
 (N'SO-5007', N'1', N'FG-MINT', N'800',  N'3.50', N'0',    1),
 (N'SO-5007', N'2', N'FG-GILE', N'300',  N'4.20', N'0',    1),
 (N'SO-5008', N'1', N'FG-CHAM', N'500',  N'3.80', N'0',    1),
 (N'SO-5009', N'1', N'FG-MINT', N'1200', N'3.20', N'0.05', 1),
 (N'SO-5009', N'2', N'FG-CHAM', N'800',  N'3.50', N'0.05', 1),
 (N'SO-5010', N'1', N'FG-GILE', N'100',  N'4.20', N'0',    1);

/* ------------------------ Inventory movements ----------------------- */
-- qty is always POSITIVE; the direction comes from movement_type:
--   IN : RECEIPT, PRODUCTION_OUTPUT, ADJUSTMENT_IN
--   OUT: ISSUE_TO_PRODUCTION, SALE_SHIPMENT, ADJUSTMENT_OUT
INSERT INTO land.inventory_movements (movement_code, movement_ts, movement_type, item_code, lot_code, production_order_code, sales_order_code, qty, uom, _batch_id) VALUES
 -- Receipts (one per accepted lot). LOT-2513 has NO receipt movement -> DQ-14
 (N'MV-0001', N'2025-01-06 08:00', N'RECEIPT', N'RM-MINT', N'LOT-2501', NULL, NULL, N'200',    N'kg',   1),
 (N'MV-0002', N'2025-01-08 08:00', N'RECEIPT', N'RM-CHAM', N'LOT-2502', NULL, NULL, N'150',    N'kg',   1),
 (N'MV-0003', N'2025-01-09 08:00', N'RECEIPT', N'PK-BAG',  N'LOT-2503', NULL, NULL, N'200000', N'unit', 1),
 (N'MV-0004', N'2025-01-09 08:00', N'RECEIPT', N'PK-BOX',  N'LOT-2504', NULL, NULL, N'12000',  N'unit', 1),
 (N'MV-0005', N'2025-01-15 08:00', N'RECEIPT', N'RM-GING', N'LOT-2505', NULL, NULL, N'80',     N'kg',   1),
 (N'MV-0006', N'2025-01-15 08:00', N'RECEIPT', N'RM-LEMN', N'LOT-2506', NULL, NULL, N'40',     N'kg',   1),
 (N'MV-0007', N'2025-02-03 08:00', N'RECEIPT', N'RM-MINT', N'LOT-2507', NULL, NULL, N'180',    N'kg',   1),
 (N'MV-0008', N'2025-02-10 08:00', N'RECEIPT', N'RM-MINT', N'LOT-2508', NULL, NULL, N'200',    N'kg',   1),
 (N'MV-0009', N'2025-02-15 08:00', N'RECEIPT', N'RM-CHAM', N'LOT-2509', NULL, NULL, N'120',    N'kg',   1),
 (N'MV-0010', N'2025-02-20 08:00', N'RECEIPT', N'RM-GING', N'LOT-2510', NULL, NULL, N'60',     N'kg',   1),
 -- PO-1001 (FG-MINT)
 (N'MV-0011', N'2025-01-13 06:00', N'ISSUE_TO_PRODUCTION', N'RM-MINT', N'LOT-2501', N'PO-1001', NULL, N'61.0',  N'kg',   1),
 (N'MV-0012', N'2025-01-13 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1001', NULL, N'40000', N'unit', 1),
 (N'MV-0013', N'2025-01-13 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1001', NULL, N'2000',  N'unit', 1),
 (N'MV-0014', N'2025-01-13 14:00', N'PRODUCTION_OUTPUT',   N'FG-MINT', NULL,       N'PO-1001', NULL, N'1950',  N'box',  1),
 -- PO-1002 (FG-CHAM)
 (N'MV-0015', N'2025-01-14 06:00', N'ISSUE_TO_PRODUCTION', N'RM-CHAM', N'LOT-2502', N'PO-1002', NULL, N'46.0',  N'kg',   1),
 (N'MV-0016', N'2025-01-14 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1002', NULL, N'30500', N'unit', 1),
 (N'MV-0017', N'2025-01-14 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1002', NULL, N'1520',  N'unit', 1),
 (N'MV-0018', N'2025-01-14 13:00', N'PRODUCTION_OUTPUT',   N'FG-CHAM', NULL,       N'PO-1002', NULL, N'1500',  N'box',  1),
 -- PO-1003 (FG-GILE)
 (N'MV-0019', N'2025-01-20 06:00', N'ISSUE_TO_PRODUCTION', N'RM-GING', N'LOT-2505', N'PO-1003', NULL, N'21.5',  N'kg',   1),
 (N'MV-0020', N'2025-01-20 06:00', N'ISSUE_TO_PRODUCTION', N'RM-LEMN', N'LOT-2506', N'PO-1003', NULL, N'10.2',  N'kg',   1),
 (N'MV-0021', N'2025-01-20 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1003', NULL, N'20000', N'unit', 1),
 (N'MV-0022', N'2025-01-20 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1003', NULL, N'1000',  N'unit', 1),
 (N'MV-0023', N'2025-01-20 12:30', N'PRODUCTION_OUTPUT',   N'FG-GILE', NULL,       N'PO-1003', NULL, N'940',   N'box',  1),
 -- PO-1004 (FG-MINT) consumes LOT-2507, which FAILED incoming inspection -> DQ-15
 (N'MV-0024', N'2025-02-05 06:00', N'ISSUE_TO_PRODUCTION', N'RM-MINT', N'LOT-2507', N'PO-1004', NULL, N'62.0',  N'kg',   1),
 (N'MV-0025', N'2025-02-05 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1004', NULL, N'41000', N'unit', 1),
 (N'MV-0026', N'2025-02-05 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1004', NULL, N'2050',  N'unit', 1),
 (N'MV-0027', N'2025-02-05 14:30', N'PRODUCTION_OUTPUT',   N'FG-MINT', NULL,       N'PO-1004', NULL, N'2010',  N'box',  1),
 -- PO-1006 (FG-MINT)
 (N'MV-0028', N'2025-02-18 06:00', N'ISSUE_TO_PRODUCTION', N'RM-MINT', N'LOT-2508', N'PO-1006', NULL, N'60.5',  N'kg',   1),
 (N'MV-0029', N'2025-02-18 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1006', NULL, N'40100', N'unit', 1),
 (N'MV-0030', N'2025-02-18 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1006', NULL, N'2010',  N'unit', 1),
 (N'MV-0031', N'2025-02-18 14:00', N'PRODUCTION_OUTPUT',   N'FG-MINT', NULL,       N'PO-1006', NULL, N'1980',  N'box',  1),
 -- PO-1007 (FG-GILE)
 (N'MV-0032', N'2025-03-04 06:00', N'ISSUE_TO_PRODUCTION', N'RM-GING', N'LOT-2510', N'PO-1007', NULL, N'24.5',  N'kg',   1),
 (N'MV-0033', N'2025-03-04 06:00', N'ISSUE_TO_PRODUCTION', N'RM-LEMN', N'LOT-2506', N'PO-1007', NULL, N'12.0',  N'kg',   1),
 (N'MV-0034', N'2025-03-04 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2503', N'PO-1007', NULL, N'23900', N'unit', 1),
 (N'MV-0035', N'2025-03-04 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1007', NULL, N'1200',  N'unit', 1),
 (N'MV-0036', N'2025-03-04 13:00', N'PRODUCTION_OUTPUT',   N'FG-GILE', NULL,       N'PO-1007', NULL, N'1150',  N'box',  1),
 -- PO-1008 (FG-CHAM) uses bags from LOT-2513 (whose receipt movement is missing)
 (N'MV-0037', N'2025-03-10 06:00', N'ISSUE_TO_PRODUCTION', N'RM-CHAM', N'LOT-2509', N'PO-1008', NULL, N'45.0',  N'kg',   1),
 (N'MV-0038', N'2025-03-10 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BAG',  N'LOT-2513', N'PO-1008', NULL, N'29800', N'unit', 1),
 (N'MV-0039', N'2025-03-10 06:00', N'ISSUE_TO_PRODUCTION', N'PK-BOX',  N'LOT-2504', N'PO-1008', NULL, N'1500',  N'unit', 1),
 (N'MV-0040', N'2025-03-10 13:00', N'PRODUCTION_OUTPUT',   N'FG-CHAM', NULL,       N'PO-1008', NULL, N'1470',  N'box',  1),
 -- Sales shipments (finished goods, boxes)
 (N'MV-0041', N'2025-01-18 10:00', N'SALE_SHIPMENT', N'FG-MINT', NULL, NULL, N'SO-5001', N'600',  N'box', 1),
 (N'MV-0042', N'2025-01-18 10:00', N'SALE_SHIPMENT', N'FG-CHAM', NULL, NULL, N'SO-5001', N'400',  N'box', 1),
 (N'MV-0043', N'2025-01-22 10:00', N'SALE_SHIPMENT', N'FG-MINT', NULL, NULL, N'SO-5002', N'1000', N'box', 1),
 (N'MV-0044', N'2025-01-22 10:00', N'SALE_SHIPMENT', N'FG-CHAM', NULL, NULL, N'SO-5002', N'600',  N'box', 1),
 (N'MV-0045', N'2025-01-22 10:00', N'SALE_SHIPMENT', N'FG-GILE', NULL, NULL, N'SO-5002', N'300',  N'box', 1),
 (N'MV-0046', N'2025-01-27 10:00', N'SALE_SHIPMENT', N'FG-GILE', NULL, NULL, N'SO-5003', N'200',  N'box', 1),
 (N'MV-0047', N'2025-02-08 10:00', N'SALE_SHIPMENT', N'FG-MINT', NULL, NULL, N'SO-5004', N'300',  N'box', 1),
 (N'MV-0048', N'2025-02-08 10:00', N'SALE_SHIPMENT', N'FG-CHAM', NULL, NULL, N'SO-5004', N'200',  N'box', 1),
 (N'MV-0049', N'2025-02-12 10:00', N'SALE_SHIPMENT', N'FG-MINT', NULL, NULL, N'SO-5005', N'1500', N'box', 1),
 (N'MV-0050', N'2025-02-15 10:00', N'SALE_SHIPMENT', N'FG-GILE', NULL, NULL, N'SO-5006', N'250',  N'box', 1),
 (N'MV-0051', N'2025-03-07 10:00', N'SALE_SHIPMENT', N'FG-MINT', NULL, NULL, N'SO-5007', N'800',  N'box', 1),
 (N'MV-0052', N'2025-03-07 10:00', N'SALE_SHIPMENT', N'FG-GILE', NULL, NULL, N'SO-5007', N'300',  N'box', 1),
 (N'MV-0053', N'2025-03-14 10:00', N'SALE_SHIPMENT', N'FG-CHAM', NULL, NULL, N'SO-5008', N'500',  N'box', 1),
 -- Month-end cycle count adjustment
 (N'MV-0054', N'2025-03-31 18:00', N'ADJUSTMENT_OUT', N'RM-MINT', N'LOT-2501', NULL, NULL, N'1.5', N'kg', 1);
GO
