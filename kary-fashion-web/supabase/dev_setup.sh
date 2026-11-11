#!/usr/bin/env bash
# Crea la base local de desarrollo «kary_dev»: simulador de Supabase + migraciones + catálogo demo + usuarias demo.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${KARY_DEV_DB:-kary_dev}"
PSQL="${PSQL:-psql}"
$PSQL -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { $PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run "$DIR/tests/00_local_supabase_shim.sql"
for f in "$DIR"/migrations/*.sql; do run "$f"; done
run "$DIR/seed.sql"
run "$DIR/dev_users.sql"
echo "Base $DB lista. Use DATABASE_URL=postgres://USUARIO:CLAVE@localhost:5432/$DB y AUTH_MODE=dev (agregue --con-actividad para datos de ejemplo)"
if [ "${1:-}" = "--con-actividad" ]; then
  run "$DIR/dev_demo_activity.sql"
  echo "Actividad de ejemplo cargada."
fi
