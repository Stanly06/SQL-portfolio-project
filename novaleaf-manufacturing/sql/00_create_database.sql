/* =====================================================================
   NovaLeaf Manufacturing - 00_create_database.sql
   Creates (or RE-creates) the NovaLeaf database.
   WARNING: drops the database if it already exists. It only contains
   fictional project data, so re-creating it is the intended way to reset.
   Tested on: SQL Server 2022 Developer. Written to avoid 2022-only syntax
   so it should also run on SQL Server 2019 (not yet tested there).
   ===================================================================== */
USE master;
GO

IF DB_ID(N'NovaLeaf') IS NOT NULL
BEGIN
    ALTER DATABASE NovaLeaf SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE NovaLeaf;
END;
GO

CREATE DATABASE NovaLeaf;
GO
