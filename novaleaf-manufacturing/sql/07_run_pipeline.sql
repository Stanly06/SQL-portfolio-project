/* =====================================================================
   07_run_pipeline.sql
   Runs the pipeline for batch 1: landing -> staging, then data quality.
   Safe to re-run: results are the same every time (idempotent).
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
EXEC etl.usp_load_staging @batch_id = 1;
GO
EXEC dq.usp_run_checks @batch_id = 1;
GO
