#!/usr/bin/env bash
# Crea una base limpia, aplica simulador de Supabase + migraciones + seed y corre las pruebas.
# Uso: bash supabase/tests/run.sh   (requiere PostgreSQL 15+ local y permisos para crear bases)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${KARY_TEST_DB:-kary_test}"
PSQL="${PSQL:-psql}"
$PSQL -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { $PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run "$DIR/tests/00_local_supabase_shim.sql"
for f in "$DIR"/migrations/*.sql; do echo "→ $(basename "$f")"; run "$f"; done
run "$DIR/seed.sql"
if [ -f "$DIR/tests/10_business_rules.sql" ]; then
  echo "→ pruebas"; $PSQL -q -X -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f "$DIR/tests/10_business_rules.sql" 2>&1 | sed -E "s/^psql:[^ ]+ //; s/^NOTICE:  //"
fi
echo "✔ Todo correcto"
