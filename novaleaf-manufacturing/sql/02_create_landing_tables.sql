/* =====================================================================
   02_create_landing_tables.sql
   Landing tables imitate extracts from source systems (ERP, quality
   system, CRM). Every business column is NVARCHAR on purpose:
   we never trust types, formats or keys coming from a source.
   Technical columns:
     _batch_id  -> which extract/batch the row came from
     _loaded_at -> when the row was written into landing
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE land.suppliers (
    supplier_code   NVARCHAR(50),
    supplier_name   NVARCHAR(200),
    country         NVARCHAR(100),
    lead_time_days  NVARCHAR(50),
    is_active       NVARCHAR(10),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.materials (
    material_code   NVARCHAR(50),
    material_name   NVARCHAR(200),
    material_type   NVARCHAR(50),
    uom             NVARCHAR(20),
    standard_cost   NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.products (
    product_code    NVARCHAR(50),
    product_name    NVARCHAR(200),
    category        NVARCHAR(50),
    uom             NVARCHAR(20),
    list_price      NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.bill_of_materials (
    product_code    NVARCHAR(50),
    material_code   NVARCHAR(50),
    qty_per_unit    NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.customers (
    customer_code   NVARCHAR(50),
    customer_name   NVARCHAR(200),
    country         NVARCHAR(100),
    channel         NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.receipt_lots (
    lot_code        NVARCHAR(50),
    supplier_code   NVARCHAR(50),
    material_code   NVARCHAR(50),
    received_date   NVARCHAR(50),
    qty_received    NVARCHAR(50),
    uom             NVARCHAR(20),
    unit_cost       NVARCHAR(50),
    expiry_date     NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.production_orders (
    production_order_code NVARCHAR(50),
    product_code    NVARCHAR(50),
    line_code       NVARCHAR(20),
    planned_date    NVARCHAR(50),
    start_ts        NVARCHAR(50),
    end_ts          NVARCHAR(50),
    planned_qty     NVARCHAR(50),
    produced_qty    NVARCHAR(50),
    scrap_qty       NVARCHAR(50),
    status          NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.quality_inspections (
    inspection_code NVARCHAR(50),
    inspection_type NVARCHAR(50),
    lot_code        NVARCHAR(50),
    production_order_code NVARCHAR(50),
    inspection_date NVARCHAR(50),
    sample_size     NVARCHAR(50),
    defects_found   NVARCHAR(50),
    result          NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.sales_orders (
    sales_order_code NVARCHAR(50),
    customer_code   NVARCHAR(50),
    order_date      NVARCHAR(50),
    ship_date       NVARCHAR(50),
    status          NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.sales_order_lines (
    sales_order_code NVARCHAR(50),
    line_no         NVARCHAR(10),
    product_code    NVARCHAR(50),
    qty             NVARCHAR(50),
    unit_price      NVARCHAR(50),
    discount_pct    NVARCHAR(50),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE land.inventory_movements (
    movement_code   NVARCHAR(50),
    movement_ts     NVARCHAR(50),
    movement_type   NVARCHAR(50),
    item_code       NVARCHAR(50),
    lot_code        NVARCHAR(50),
    production_order_code NVARCHAR(50),
    sales_order_code NVARCHAR(50),
    qty             NVARCHAR(50),
    uom             NVARCHAR(20),
    _batch_id       INT       NOT NULL,
    _loaded_at      DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);
GO
