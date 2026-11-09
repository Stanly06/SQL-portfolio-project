# Business questions and KPI definitions

These are the questions the analytical stages (3–4) will answer. Definitions are written **before** the SQL,
so the logic can be agreed and reviewed first. Each KPI states its **grain** and its edge cases.

## Production

| KPI | Definition | Grain | Edge cases to decide |
|---|---|---|---|
| Plan attainment % | `produced_qty / planned_qty` | production order → line → month | Exclude IN_PROGRESS, PLANNED, CANCELLED? Over-production (>100%) capped or not? |
| Scrap rate % | `scrap_qty / (produced_qty + scrap_qty)` | order → product → month | Orders with NULL scrap |
| Material usage variance | actual issued qty − standard qty (BOM × (produced + scrap)) | order × material | Materials issued from several lots; uom must match |
| Cycle time | `end_ts − start_ts` | order | Negative durations (DQ-08) |

## Quality

| KPI | Definition | Grain | Edge cases to decide |
|---|---|---|---|
| Lot acceptance rate | lots whose **latest** incoming inspection is PASS / lots inspected | supplier → month | Re-inspections (DQ-10): first result or final result? |
| First-pass yield | orders that PASS at the **first** FINAL inspection / orders inspected | line → product | Orders never inspected |
| Defect rate | `defects_found / sample_size` | inspection → aggregated | Average of ratios vs ratio of sums |

## Inventory

| KPI | Definition | Grain | Edge cases to decide |
|---|---|---|---|
| On-hand balance | running `SUM(signed_qty)` | item × lot × day | Days without movements (need a calendar) |
| Days of supply | on-hand / average daily consumption | material | Period used for the average |
| Material on hold | balance of lots whose latest inspection is FAIL | lot | Lots partly consumed before failing |

## Suppliers

| KPI | Definition | Grain | Edge cases to decide |
|---|---|---|---|
| Purchase price variance | `(unit_cost − standard_cost) × qty_received` | lot → supplier | Unit conversion (DQ-04) |
| Supplier ranking | rank by acceptance rate, then price variance | supplier | Ties (RANK vs DENSE_RANK) |

## Sales

| KPI | Definition | Grain | Edge cases to decide |
|---|---|---|---|
| Net revenue | `qty × unit_price × (1 − discount_pct)` | order line → customer → month | Exclude CANCELLED and OPEN? Quarantined lines |
| Average selling price vs list price | net revenue / qty vs `list_price` | product | Discounts by channel |
| Order-to-ship days | `ship_date − order_date` | order | Negative values (DQ-13), not shipped yet |
| Month-over-month growth | change vs previous month | product / customer | Months with no sales (missing rows) |

## Cross-process questions

1. Which finished orders consumed material from a lot that had not passed inspection, and which customers
   received products from those orders? (traceability)
2. Do inventory movements reconcile with receipts, production and shipments for every period?
3. Which supplier's lots are linked to the highest scrap rate in production?
