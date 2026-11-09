/* =====================================================================
   01_create_schemas.sql
   Staged architecture INSIDE one SQL Server database:

     land  -> raw extracts exactly as received (all text, no constraints)
     stg   -> typed, cleaned, validated data with PK/FK/CHECK constraints
     dw    -> dimensional model for analysis        (stage 3, not built yet)
     etl   -> load procedures and load log
     dq    -> quarantined rows and data quality check results

   Note: this resembles the Bronze/Silver/Gold idea, but it is NOT a
   lakehouse Medallion implementation (no files, no Delta tables, no
   separate storage/compute). See docs/decisions_and_limitations.md.
   ===================================================================== */
USE NovaLeaf;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
CREATE SCHEMA land;
GO
CREATE SCHEMA stg;
GO
CREATE SCHEMA etl;
GO
CREATE SCHEMA dq;
GO
