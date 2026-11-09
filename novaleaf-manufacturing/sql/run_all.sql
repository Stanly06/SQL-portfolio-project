/* =====================================================================
   run_all.sql - builds the whole project in order.
   HOW TO RUN IN SSMS:
     1) Menu Query -> SQLCMD Mode (must be enabled for :setvar / :r)
     2) Change ProjectPath below to the folder where you cloned the repo
     3) Execute (F5)
   From a terminal (sqlcmd), after editing ProjectPath below:
     sqlcmd -S localhost -E -C -I -i run_all.sql
   Note: the :setvar line inside this file takes precedence over a
   "-v ProjectPath=..." passed on the command line, so edit the line itself.
   ===================================================================== */
:setvar ProjectPath "C:\dev\SQL-portfolio-project\novaleaf-manufacturing"
:on error exit

:r $(ProjectPath)\sql\00_create_database.sql
:r $(ProjectPath)\sql\01_create_schemas.sql
:r $(ProjectPath)\sql\02_create_landing_tables.sql
:r $(ProjectPath)\sql\03_seed_landing_data.sql
:r $(ProjectPath)\sql\04_create_staging_tables.sql
:r $(ProjectPath)\sql\05_create_etl_objects.sql
:r $(ProjectPath)\sql\06_create_dq_checks.sql
:r $(ProjectPath)\sql\07_run_pipeline.sql
