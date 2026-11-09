# Data quality catalog

The seed data (`sql/03_seed_landing_data.sql`) contains these issues **on purpose**. Each one is marked in
the script with its code. The table explains how the pipeline handles it and where the result is visible.

Handling types:
- **Fix** — a deterministic, documented rule corrects the value during staging.
- **Dedup** — duplicate rows are removed with `ROW_NUMBER()` (latest `_loaded_at` wins).
- **Quarantine** — the row is not loaded; it is stored in `dq.rejected_rows` with a reason.
- **Warn** — the row is loaded, and a data quality check reports it for review.
- **Model** — not an error; the data model must support it.

| Code | Issue | Record(s) | Handling | Where it shows |
|---|---|---|---|---|
| DQ-01 | Exact duplicate rows (re-sent extract) | CUS-02, LOT-2501 | Dedup | `etl.load_step_log.rows_duplicate` |
| DQ-02 | Code with spaces and lowercase (`' sup-01 '`) | LOT-2508 | Fix: `UPPER(TRIM())` | stg value `SUP-01` |
| DQ-03 | Date in `dd/mm/yyyy` instead of `yyyy-mm-dd` | LOT-2509 | Fix: `TRY_CONVERT` style 23, then style 103 | stg `received_date = 2025-02-15` |
| DQ-04 | Quantity in grams for a material managed in kg | LOT-2510 | Fix: qty / 1000, cost × 1000 | stg 60 kg at 5.30 USD/kg |
| DQ-05 | Lot from an unknown supplier (`SUP-99`) | LOT-2511 | Quarantine | `dq.rejected_rows`, check C11 |
| DQ-06 | Negative received quantity | LOT-2512 | Quarantine | `dq.rejected_rows`, check C11 |
| DQ-07 | COMPLETED order without produced quantity | PO-1005 | Quarantine | `dq.rejected_rows`, check C11 |
| DQ-08 | Order ends before it starts | PO-1006 | Warn | check C08 |
| DQ-09 | Inconsistent casing / trailing spaces (`completed`, `Pass`, `PASS `) | PO-1006, INS-002, INS-005 | Fix: `UPPER(TRIM())` | stg values |
| DQ-10 | Re-inspections: same lot / order inspected twice | LOT-2508, PO-1003 | Model: inspection grain = one event | affects KPI design (latest vs first result) |
| DQ-11 | Inspection with no lot and no order | INS-021 | Quarantine | `dq.rejected_rows`, check C11 |
| DQ-12 | Discount `10`: 10% or 1000%? | SO-5005 line 1 | Quarantine (ambiguous, not fixed silently) | `dq.rejected_rows`, C11 and **C06** |
| DQ-13 | Shipped before it was ordered | SO-5006 | Warn | check C09 |
| DQ-14 | Lot received but its RECEIPT movement is missing | LOT-2513 | Detected by reconciliation | checks **C02** and **C04** (balance −29,800 bags) |
| DQ-15 | Material consumed from a lot that failed inspection | LOT-2507 in PO-1004 | Warn | check C07 |

## Lessons visible in the results

- **One root cause, two symptoms.** DQ-14 makes both C02 (missing receipt) and C04 (negative balance) fail.
  When several checks fail, look for a shared cause before fixing each one separately.
- **Quarantine has downstream effects.** DQ-12 removes a sales line, so the shipment of SO-5005 no longer
  reconciles (C06). Rejecting data is safer than guessing, but it must be tracked and resolved.
- **Hard reject vs warning.** A missing key or impossible value is rejected. A suspicious but usable value
  (swapped timestamps, ship before order) is kept and flagged, so the rest of the row is not lost.

## Defects found by the automated tests while building the pipeline

These are real defects in the pipeline code itself, found by `tests/test_stage2_expected_results.sql`:

1. **`SUM()` over zero rows returns NULL, not 0.** When an entity had no rows in a batch, the row-accounting
   insert failed on a NOT NULL column. Fixed with `COALESCE(SUM(...), 0)`.
2. **`col NOT IN (...)` is UNKNOWN when `col` is NULL**, so a NULL status would not be rejected and would
   then break the insert into staging. Fixed with `COALESCE(col, '') NOT IN (...)`.
3. **sqlcmd defaults to `QUOTED_IDENTIFIER OFF`** (SSMS uses ON). Tables with persisted computed columns
   require ON, so every script now sets it explicitly.
