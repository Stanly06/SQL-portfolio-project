/* =====================================================================
   04_create_staging_tables.sql
   Typed and validated tables. Unlike landing, staging ENFORCES rules
   with constraints (PK, FK, CHECK). Rows that would break a rule are
   sent to dq.rejected_rows by the load procedure instead of failing.
   Business keys (codes) are used as primary keys at this layer;
   surrogate keys will be introduced in the dimensional model (stage 3).
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE stg.supplier (
    supplier_code    VARCHAR(10)   NOT NULL CONSTRAINT pk_supplier PRIMARY KEY,
    supplier_name    NVARCHAR(100) NOT NULL,
    country          NVARCHAR(60)  NOT NULL,
    lead_time_days   INT           NOT NULL CONSTRAINT ck_supplier_lead CHECK (lead_time_days >= 0),
    is_active        BIT           NOT NULL
);

CREATE TABLE stg.material (
    material_code    VARCHAR(10)   NOT NULL CONSTRAINT pk_material PRIMARY KEY,
    material_name    NVARCHAR(100) NOT NULL,
    material_type    VARCHAR(10)   NOT NULL CONSTRAINT ck_material_type CHECK (material_type IN ('RAW', 'PACKAGING')),
    uom              VARCHAR(10)   NOT NULL CONSTRAINT ck_material_uom  CHECK (uom IN ('kg', 'unit')),
    standard_cost    DECIMAL(12,4) NOT NULL CONSTRAINT ck_material_cost CHECK (standard_cost >= 0)
);

CREATE TABLE stg.product (
    product_code     VARCHAR(10)   NOT NULL CONSTRAINT pk_product PRIMARY KEY,
    product_name     NVARCHAR(100) NOT NULL,
    category         NVARCHAR(30)  NOT NULL,
    uom              VARCHAR(10)   NOT NULL CONSTRAINT ck_product_uom CHECK (uom = 'box'),
    list_price       DECIMAL(10,2) NOT NULL CONSTRAINT ck_product_price CHECK (list_price >= 0)
);

-- Grain: one row per product and material (standard quantity for ONE box)
CREATE TABLE stg.bill_of_materials (
    product_code     VARCHAR(10)   NOT NULL CONSTRAINT fk_bom_product  REFERENCES stg.product(product_code),
    material_code    VARCHAR(10)   NOT NULL CONSTRAINT fk_bom_material REFERENCES stg.material(material_code),
    qty_per_unit     DECIMAL(12,4) NOT NULL CONSTRAINT ck_bom_qty CHECK (qty_per_unit > 0),
    CONSTRAINT pk_bill_of_materials PRIMARY KEY (product_code, material_code)
);

CREATE TABLE stg.customer (
    customer_code    VARCHAR(10)   NOT NULL CONSTRAINT pk_customer PRIMARY KEY,
    customer_name    NVARCHAR(100) NOT NULL,
    country          NVARCHAR(60)  NOT NULL,
    channel          VARCHAR(20)   NOT NULL CONSTRAINT ck_customer_channel CHECK (channel IN ('Retail', 'Distributor', 'Online'))
);

-- Grain: one row per received lot. Quantities are stored in the material's uom.
CREATE TABLE stg.receipt_lot (
    lot_code         VARCHAR(12)   NOT NULL CONSTRAINT pk_receipt_lot PRIMARY KEY,
    supplier_code    VARCHAR(10)   NOT NULL CONSTRAINT fk_lot_supplier REFERENCES stg.supplier(supplier_code),
    material_code    VARCHAR(10)   NOT NULL CONSTRAINT fk_lot_material REFERENCES stg.material(material_code),
    received_date    DATE          NOT NULL,
    qty_received     DECIMAL(14,3) NOT NULL CONSTRAINT ck_lot_qty CHECK (qty_received > 0),
    uom              VARCHAR(10)   NOT NULL,
    unit_cost        DECIMAL(12,6) NOT NULL CONSTRAINT ck_lot_cost CHECK (unit_cost >= 0),
    expiry_date      DATE          NULL,
    CONSTRAINT ck_lot_expiry CHECK (expiry_date IS NULL OR expiry_date > received_date)
);

-- Grain: one row per production order. Quantities in boxes.
CREATE TABLE stg.production_order (
    production_order_code VARCHAR(10) NOT NULL CONSTRAINT pk_production_order PRIMARY KEY,
    product_code     VARCHAR(10)   NOT NULL CONSTRAINT fk_po_product REFERENCES stg.product(product_code),
    line_code        VARCHAR(5)    NOT NULL,
    planned_date     DATE          NOT NULL,
    start_ts         DATETIME2(0)  NULL,
    end_ts           DATETIME2(0)  NULL,
    planned_qty      INT           NOT NULL CONSTRAINT ck_po_planned CHECK (planned_qty > 0),
    produced_qty     INT           NULL     CONSTRAINT ck_po_produced CHECK (produced_qty >= 0),
    scrap_qty        INT           NULL     CONSTRAINT ck_po_scrap CHECK (scrap_qty >= 0),
    status           VARCHAR(12)   NOT NULL CONSTRAINT ck_po_status CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    -- a completed order must report its output
    CONSTRAINT ck_po_completed_output CHECK (status <> 'COMPLETED' OR produced_qty IS NOT NULL)
);

-- Grain: one row per inspection event (a lot or an order can be inspected more than once)
CREATE TABLE stg.quality_inspection (
    inspection_code  VARCHAR(10)   NOT NULL CONSTRAINT pk_quality_inspection PRIMARY KEY,
    inspection_type  VARCHAR(10)   NOT NULL CONSTRAINT ck_insp_type CHECK (inspection_type IN ('INCOMING', 'FINAL')),
    lot_code         VARCHAR(12)   NULL     CONSTRAINT fk_insp_lot REFERENCES stg.receipt_lot(lot_code),
    production_order_code VARCHAR(10) NULL  CONSTRAINT fk_insp_po  REFERENCES stg.production_order(production_order_code),
    inspection_date  DATE          NOT NULL,
    sample_size      INT           NOT NULL CONSTRAINT ck_insp_sample CHECK (sample_size > 0),
    defects_found    INT           NOT NULL CONSTRAINT ck_insp_defects CHECK (defects_found >= 0),
    result           VARCHAR(4)    NOT NULL CONSTRAINT ck_insp_result CHECK (result IN ('PASS', 'FAIL')),
    CONSTRAINT ck_insp_defects_le_sample CHECK (defects_found <= sample_size),
    -- INCOMING inspections point to a lot, FINAL inspections to a production order (exactly one)
    CONSTRAINT ck_insp_reference CHECK (
        (inspection_type = 'INCOMING' AND lot_code IS NOT NULL AND production_order_code IS NULL)
     OR (inspection_type = 'FINAL'    AND lot_code IS NULL     AND production_order_code IS NOT NULL))
);

-- Grain: one row per sales order (header)
CREATE TABLE stg.sales_order (
    sales_order_code VARCHAR(10)   NOT NULL CONSTRAINT pk_sales_order PRIMARY KEY,
    customer_code    VARCHAR(10)   NOT NULL CONSTRAINT fk_so_customer REFERENCES stg.customer(customer_code),
    order_date       DATE          NOT NULL,
    ship_date        DATE          NULL,
    status           VARCHAR(10)   NOT NULL CONSTRAINT ck_so_status CHECK (status IN ('OPEN', 'SHIPPED', 'CANCELLED'))
);

-- Grain: one row per sales order line
CREATE TABLE stg.sales_order_line (
    sales_order_code VARCHAR(10)   NOT NULL CONSTRAINT fk_sol_order REFERENCES stg.sales_order(sales_order_code),
    line_no          INT           NOT NULL,
    product_code     VARCHAR(10)   NOT NULL CONSTRAINT fk_sol_product REFERENCES stg.product(product_code),
    qty              INT           NOT NULL CONSTRAINT ck_sol_qty CHECK (qty > 0),
    unit_price       DECIMAL(10,2) NOT NULL CONSTRAINT ck_sol_price CHECK (unit_price >= 0),
    discount_pct     DECIMAL(5,4)  NOT NULL CONSTRAINT ck_sol_discount CHECK (discount_pct BETWEEN 0 AND 1),
    CONSTRAINT pk_sales_order_line PRIMARY KEY (sales_order_code, line_no)
);

-- Grain: one row per inventory movement.
-- item_code can be a material OR a product, so it cannot have a single FK;
-- that rule is validated by the load procedure and by a data quality check.
CREATE TABLE stg.inventory_movement (
    movement_code    VARCHAR(10)   NOT NULL CONSTRAINT pk_inventory_movement PRIMARY KEY,
    movement_ts      DATETIME2(0)  NOT NULL,
    movement_type    VARCHAR(20)   NOT NULL CONSTRAINT ck_mv_type CHECK (movement_type IN
                         ('RECEIPT', 'ISSUE_TO_PRODUCTION', 'PRODUCTION_OUTPUT', 'SALE_SHIPMENT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
    item_code        VARCHAR(10)   NOT NULL,
    lot_code         VARCHAR(12)   NULL CONSTRAINT fk_mv_lot REFERENCES stg.receipt_lot(lot_code),
    production_order_code VARCHAR(10) NULL CONSTRAINT fk_mv_po REFERENCES stg.production_order(production_order_code),
    sales_order_code VARCHAR(10)   NULL CONSTRAINT fk_mv_so REFERENCES stg.sales_order(sales_order_code),
    qty              DECIMAL(14,3) NOT NULL CONSTRAINT ck_mv_qty CHECK (qty > 0),
    uom              VARCHAR(10)   NOT NULL,
    -- signed quantity derived from the movement type (persisted computed column)
    signed_qty AS (CASE WHEN movement_type IN ('RECEIPT', 'PRODUCTION_OUTPUT', 'ADJUSTMENT_IN')
                        THEN qty ELSE -qty END) PERSISTED
);
GO
