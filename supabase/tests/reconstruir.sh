#!/usr/bin/env bash
# Reconstrução completa 000→N num Postgres local que imita o Supabase.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/reconstruir.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=painel_sendflow_teste
psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
P="psql -q -X -v ON_ERROR_STOP=1 -d $DB"
$P <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Mesmos default privileges que o Supabase aplica no schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL
for m in migrations/*.sql; do
  n=$(basename "$m" | cut -d- -f1)
  echo "== $n pre";  $P -At -c "$(cat checks/$n-pre.sql)" | tail -1
  echo "== $n migração"; $P -f "$m"
  echo "== $n post"; $P -At -c "$(cat checks/$n-post.sql)" | tail -1
done
echo "== reaplicar 000 deve falhar pelo guard"
if $P -f migrations/000-base.sql 2>/dev/null; then echo "ERRO: guard não bloqueou"; exit 1; else echo "guard OK"; fi
echo "== comportamento"
$P -f tests/comportamento.sql
[ -f tests/monitor.sql ] && $P -f tests/monitor.sql
[ -f tests/historico.sql ] && $P -f tests/historico.sql
[ -f tests/paginas.sql ] && $P -f tests/paginas.sql
[ -f tests/entradas.sql ] && $P -f tests/entradas.sql
