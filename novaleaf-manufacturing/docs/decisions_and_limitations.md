# Technical decisions and limitations

Short records of the main design decisions: what was chosen, why, and what it costs.

## D1. Staged schemas inside one SQL Server database (not a lakehouse)
- **Decision:** `land` → `stg` → `dw` schemas in a single database, plus `etl` and `dq`.
- **Why:** simple to run on one Windows machine; shows the same layering idea used in larger platforms.
- **Difference from a lakehouse Medallion architecture:** a lakehouse (e.g. Databricks + Delta Lake) stores
  each layer as files/tables in object storage, separates storage from compute, supports schema evolution and
  time travel, and scales horizontally. None of that exists here. This project shows the *logic* of layering,
  not the infrastructure.

## D2. Landing tables are all text
- **Decision:** every business column in `land` is `NVARCHAR`.
- **Why:** sources send wrong formats (dates as `15/02/2025`, quantities in grams). If landing used strict
  types, the load would fail before we could even see the bad row.
- **Cost:** every value must be converted in staging (`TRY_CONVERT`).

## D3. `TRY_CONVERT` + reject reason instead of letting the load fail
- **Decision:** invalid values become NULL, a `CASE` assigns a `reject_reason`, and the row goes to
  `dq.rejected_rows` with the original record as JSON.
- **Why:** one bad row should not stop the whole load, and every rejected row must be traceable.
- **Cost:** rejected rows must be reviewed; ignoring the quarantine hides real problems (see DQ-12 → C06).

## D4. Constraints in staging as the last line of defense
- **Decision:** staging has PK, FK and CHECK constraints even though the procedure validates first.
- **Why:** if a validation rule has a bug, the constraint stops bad data instead of loading it silently.

## D5. Full refresh of staging inside one transaction
- **Decision:** `etl.usp_load_staging` deletes and rebuilds staging for the batch, in one transaction with
  `SET XACT_ABORT ON` and `TRY...CATCH`.
- **Why:** simple and idempotent (re-running gives the same result; tested); all-or-nothing.
- **Cost:** reprocesses everything every time. Fine for small data; the incremental pattern comes in stage 5.
- **Limitation:** each batch is treated as a complete snapshot of the source.

## D6. Business codes as keys in staging; surrogate keys later
- **Decision:** `stg` uses source codes (`LOT-2501`) as primary keys. The dimensional model (stage 3) will add
  surrogate keys.
- **Why:** staging should stay close to the source; surrogate keys are needed for history (SCD Type 2).

## D7. Positive quantities + direction from movement type
- **Decision:** `qty` is always positive; `signed_qty` is a persisted computed column derived from the type.
- **Why:** avoids the classic error of a sign stored inconsistently by different processes.

## D8. Polymorphic `item_code` in inventory movements
- **Decision:** one `item_code` column for materials and products.
- **Why:** mirrors how many ERPs store stock movements.
- **Cost:** no single foreign key is possible, so validity is enforced by the load procedure and the uom check.
  A stricter alternative is separate columns (`material_code`, `product_code`) with a CHECK that exactly one is set.

## D9. Ambiguous values are quarantined, not guessed
- **Decision:** a discount of `10` is rejected instead of being converted to `0.10`.
- **Why:** guessing could silently change revenue. The correct fix belongs to the source owner.

## D10. Small dataset on purpose
- **Why:** every number can be verified by hand, and the tests compare against hand-calculated values.
- **Limitation:** proves correctness only. It says nothing about performance; any performance claim in later
  stages will need a larger generated dataset and real measurements.

## Environment
- Developed and tested on SQL Server 2022 Developer Edition (also run under compatibility level 150).
- Syntax that only exists in SQL Server 2022 (`GREATEST`, `DATETRUNC`, `GENERATE_SERIES`,
  `IS DISTINCT FROM`) is avoided. Note that compatibility level 150 is not the same as a real SQL Server
  2019 instance, which has not been tested.
- Minimum features used: `TRIM`, `STRING_AGG` (2017+), `FOR JSON`, `DROP ... IF EXISTS`,
  `CREATE OR ALTER` (2016+).
