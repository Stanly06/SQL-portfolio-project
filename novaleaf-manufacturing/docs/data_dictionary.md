# Data dictionary — staging layer (`stg`)

All data is **fictional**. Period covered: January–March 2025. Currency: USD.

## Units of measure

| Unit | Used for | Notes |
|---|---|---|
| `kg` | Raw materials (leaves, flowers, peel, ginger) | Lots received in grams (`g`) are converted to kg during staging |
| `unit` | Packaging (tea bags, boxes) | |
| `box` | Finished products | 1 box = 20 tea bags |

## Tables

### `stg.supplier` — one row per supplier
| Column | Type | Key | Description |
|---|---|---|---|
| supplier_code | VARCHAR(10) | PK | Business code, e.g. `SUP-01` |
| supplier_name | NVARCHAR(100) | | |
| country | NVARCHAR(60) | | |
| lead_time_days | INT | | Agreed days from purchase order to delivery (≥ 0) |
| is_active | BIT | | 1 = active supplier |

### `stg.material` — one row per raw material or packaging item
| Column | Type | Key | Description |
|---|---|---|---|
| material_code | VARCHAR(10) | PK | `RM-*` raw material, `PK-*` packaging |
| material_name | NVARCHAR(100) | | |
| material_type | VARCHAR(10) | | `RAW` or `PACKAGING` |
| uom | VARCHAR(10) | | `kg` or `unit` |
| standard_cost | DECIMAL(12,4) | | Standard cost in USD per uom |

### `stg.product` — one row per finished product
| Column | Type | Key | Description |
|---|---|---|---|
| product_code | VARCHAR(10) | PK | `FG-*` |
| product_name | NVARCHAR(100) | | |
| category | NVARCHAR(30) | | `Herbal` or `Blend` |
| uom | VARCHAR(10) | | Always `box` |
| list_price | DECIMAL(10,2) | | List price in USD per box |

### `stg.bill_of_materials` — one row per product + material
Standard quantity of a material needed to make **one box**.
| Column | Type | Key | Description |
|---|---|---|---|
| product_code | VARCHAR(10) | PK, FK → product | |
| material_code | VARCHAR(10) | PK, FK → material | |
| qty_per_unit | DECIMAL(12,4) | | In the material's uom (e.g. 0.030 kg of leaf, 20 bags, 1 box) |

### `stg.customer` — one row per customer
| Column | Type | Key | Description |
|---|---|---|---|
| customer_code | VARCHAR(10) | PK | `CUS-*` |
| customer_name | NVARCHAR(100) | | Fictional names |
| country | NVARCHAR(60) | | |
| channel | VARCHAR(20) | | `Retail`, `Distributor` or `Online` |

### `stg.receipt_lot` — one row per lot received from a supplier
| Column | Type | Key | Description |
|---|---|---|---|
| lot_code | VARCHAR(12) | PK | `LOT-*` |
| supplier_code | VARCHAR(10) | FK → supplier | |
| material_code | VARCHAR(10) | FK → material | |
| received_date | DATE | | |
| qty_received | DECIMAL(14,3) | | In the material's uom (> 0) |
| uom | VARCHAR(10) | | Material's uom after conversion |
| unit_cost | DECIMAL(12,6) | | Actual purchase cost in USD per uom |
| expiry_date | DATE | | NULL for packaging; must be after received_date |

### `stg.production_order` — one row per production order
| Column | Type | Key | Description |
|---|---|---|---|
| production_order_code | VARCHAR(10) | PK | `PO-*` |
| product_code | VARCHAR(10) | FK → product | |
| line_code | VARCHAR(5) | | Production line `L1` or `L2` |
| planned_date | DATE | | |
| start_ts / end_ts | DATETIME2(0) | | NULL when not started / not finished |
| planned_qty | INT | | Boxes planned (> 0) |
| produced_qty | INT | | Good boxes produced. NULL while not finished; required when COMPLETED |
| scrap_qty | INT | | Boxes scrapped |
| status | VARCHAR(12) | | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |

### `stg.quality_inspection` — one row per inspection event
A lot or an order **can be inspected more than once** (re-inspection after a failure).
| Column | Type | Key | Description |
|---|---|---|---|
| inspection_code | VARCHAR(10) | PK | `INS-*` |
| inspection_type | VARCHAR(10) | | `INCOMING` (lot) or `FINAL` (production order) |
| lot_code | VARCHAR(12) | FK → receipt_lot | Only for INCOMING |
| production_order_code | VARCHAR(10) | FK → production_order | Only for FINAL |
| inspection_date | DATE | | |
| sample_size | INT | | Units inspected (> 0) |
| defects_found | INT | | 0 ≤ defects ≤ sample_size |
| result | VARCHAR(4) | | `PASS` or `FAIL` |

### `stg.sales_order` — one row per sales order (header)
| Column | Type | Key | Description |
|---|---|---|---|
| sales_order_code | VARCHAR(10) | PK | `SO-*` |
| customer_code | VARCHAR(10) | FK → customer | |
| order_date | DATE | | |
| ship_date | DATE | | NULL if not shipped |
| status | VARCHAR(10) | | `OPEN`, `SHIPPED`, `CANCELLED` |

### `stg.sales_order_line` — one row per order line
| Column | Type | Key | Description |
|---|---|---|---|
| sales_order_code | VARCHAR(10) | PK, FK → sales_order | |
| line_no | INT | PK | |
| product_code | VARCHAR(10) | FK → product | |
| qty | INT | | Boxes (> 0) |
| unit_price | DECIMAL(10,2) | | USD per box before discount |
| discount_pct | DECIMAL(5,4) | | Fraction between 0 and 1 (0.05 = 5%) |

Net line amount (not stored): `qty * unit_price * (1 - discount_pct)`.

### `stg.inventory_movement` — one row per stock movement
| Column | Type | Key | Description |
|---|---|---|---|
| movement_code | VARCHAR(10) | PK | `MV-*` |
| movement_ts | DATETIME2(0) | | |
| movement_type | VARCHAR(20) | | See below |
| item_code | VARCHAR(10) | | A material **or** a product (no single FK possible; validated by the load) |
| lot_code | VARCHAR(12) | FK → receipt_lot | For material movements |
| production_order_code | VARCHAR(10) | FK → production_order | For issues and output |
| sales_order_code | VARCHAR(10) | FK → sales_order | For shipments |
| qty | DECIMAL(14,3) | | Always positive |
| uom | VARCHAR(10) | | Must match the item's uom |
| signed_qty | computed | | `+qty` for RECEIPT, PRODUCTION_OUTPUT, ADJUSTMENT_IN; `-qty` otherwise |

| movement_type | Direction | Typical item |
|---|---|---|
| RECEIPT | in | material |
| ISSUE_TO_PRODUCTION | out | material |
| PRODUCTION_OUTPUT | in | product |
| SALE_SHIPMENT | out | product |
| ADJUSTMENT_IN / ADJUSTMENT_OUT | in / out | any (cycle count corrections) |

## Support tables

| Table | Grain | Purpose |
|---|---|---|
| `land.*` | one row per extracted record (duplicates possible) | Raw extracts, all NVARCHAR, plus `_batch_id`, `_loaded_at` |
| `etl.load_step_log` | one row per entity per load | rows read / duplicate / rejected / loaded (must add up) |
| `dq.rejected_rows` | one row per quarantined record | reason + original row as JSON |
| `dq.check_run` | one row per execution of the checks | |
| `dq.check_result` | one row per check per run | failed rows and PASS / FAIL / WARN |

## Business rules enforced

1. A COMPLETED production order must report `produced_qty`.
2. INCOMING inspections reference only a lot; FINAL inspections reference only a production order.
3. Quantities received, produced, sold and moved must be positive; the direction of a movement comes from its type.
4. Discounts are fractions between 0 and 1. Values outside that range are ambiguous and are quarantined, not "fixed".
5. Material should only be issued from lots whose latest incoming inspection is PASS (checked as a WARNING).
