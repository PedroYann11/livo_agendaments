#!/usr/bin/env bash
# =====================================================================
# Sobe um PostgreSQL descartável, aplica as migrations, roda as suítes e
# confere que o motor de horários e os endereços reservados do banco e do
# navegador são os mesmos.
# Origem: livo@d74d591 · supabase/tests/rodar.sh (reduzido)
#
#   ./supabase/tests/rodar.sh           roda tudo
#   ./supabase/tests/rodar.sh --manter  deixa o banco de pé para inspeção
# =====================================================================
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/livo-agenda-teste}
PORTA=${PORTA:-55433}
SOCK=/tmp
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="psql -h $SOCK -p $PORTA -U postgres -d agenda_teste -v ON_ERROR_STOP=1 -q"

su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
su postgres -s /bin/bash -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORTA -k $SOCK' -l $PGDATA/log start -w" >/dev/null
psql -h $SOCK -p $PORTA -U postgres -q -c "create database agenda_teste"

# cada migration é testada logo depois de aplicada, sobre o banco que as
# anteriores deixaram — como acontece em produção. A suíte de uma migration
# tem o mesmo número dela: migrations/002_x.sql → tests/002_x.sql.
$PSQL -f "$RAIZ/supabase/tests/00_ambiente.sql"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  $PSQL -f "$f"; echo "   aplicada $(basename "$f")"
  numero=$(basename "$f" | cut -c1-3)
  for t in "$RAIZ"/supabase/tests/"$numero"_*.sql; do
    if [ -e "$t" ]; then $PSQL -f "$t"; fi
  done
done

# o motor do banco e o do navegador precisam dar as mesmas vagas
if command -v node >/dev/null; then
  ( cd "$RAIZ/supabase/tests/paridade" && PORTA=$PORTA node --import ./registrar.mjs --experimental-strip-types --no-warnings paridade.mts 150 )
  ( cd "$RAIZ/supabase/tests/paridade" && PORTA=$PORTA node --import ./registrar.mjs --experimental-strip-types --no-warnings reservados.mts )
fi

if [ "${1:-}" != "--manter" ]; then
  su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA stop -m fast" >/dev/null
fi
