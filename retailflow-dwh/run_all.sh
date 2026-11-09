#!/usr/bin/env bash
# Ejecuta el pipeline completo de punta a punta.
# Uso:  ./run_all.sh [nombre_bd]        (por defecto: retailflow)
# Variables opcionales: PGHOST, PGPORT, PGUSER, PGPASSWORD
set -euo pipefail
DB="${1:-retailflow}"
cd "$(dirname "$0")/sql"
run() { echo ">>> $1"; psql -v ON_ERROR_STOP=1 -q -X -d "$DB" -f "$1"; }

run 00_schemas.sql
run 01_raw_generate.sql          > /dev/null
run 02_staging.sql
run 03_dimensional_model.sql
run 04_load_procedures.sql
echo "--- Llega un nuevo lote de datos (carga incremental) ---"
run 05_new_batch.sql             > /dev/null
run 02_staging.sql
run 06_incremental_load.sql
echo "--- Tests de calidad de datos ---"
run 07_data_quality.sql
run 08_performance.sql           > /dev/null
echo "--- Consultas analíticas ---"
for f in analytics/*.sql; do run "$f" > /dev/null; done
echo "Pipeline completado OK."
