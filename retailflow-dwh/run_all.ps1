# Versión Windows (PowerShell) de run_all.sh
# Uso:  .\run_all.ps1 -Db retailflow -User postgres
# Requiere psql en el PATH (viene con el instalador de PostgreSQL:
#   C:\Program Files\PostgreSQL\16\bin). Define $env:PGPASSWORD antes si hace falta.
param([string]$Db = "retailflow", [string]$User = "postgres", [string]$PgHost = "localhost")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "sql")
$env:PGCLIENTENCODING = "UTF8"

function Run($file) {
    Write-Host ">>> $file"
    & psql -v ON_ERROR_STOP=1 -q -X -h $PgHost -U $User -d $Db -f $file
    if ($LASTEXITCODE -ne 0) { throw "Falló $file" }
}

Run 00_schemas.sql
Run 01_raw_generate.sql | Out-Null
Run 02_staging.sql
Run 03_dimensional_model.sql
Run 04_load_procedures.sql
Write-Host "--- Nuevo lote de datos (carga incremental) ---"
Run 05_new_batch.sql | Out-Null
Run 02_staging.sql
Run 06_incremental_load.sql
Write-Host "--- Tests de calidad de datos ---"
Run 07_data_quality.sql
Run 08_performance.sql | Out-Null
Get-ChildItem analytics\*.sql | ForEach-Object { Run $_.FullName | Out-Null }
Write-Host "Pipeline completado OK."
