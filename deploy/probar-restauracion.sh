#!/usr/bin/env bash
# Prueba de restauración: restaura una copia en una base aparte, controla que
# estén los datos y la borra. Hacerla al menos una vez por mes (o con cron):
#
#   bash deploy/probar-restauracion.sh                 # la copia más nueva
#   bash deploy/probar-restauracion.sh archivo.dump    # una en particular
#
# SIN_DOCKER=1 usa psql y pg_restore locales con PGHOST, PGPORT y PGUSER.
set -Eeuo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

DIR="${COPIAS_DIR:-/var/backups/vektra}"
ARCHIVO="${1:-$(ls -1t "$DIR"/erp-*.dump 2>/dev/null | head -1)}"
[ -f "$ARCHIVO" ] || { echo "No hay copia para probar (${ARCHIVO:-$DIR vacío})."; exit 1; }
PRUEBA="erp_prueba_restauracion"

sql() {
  if [ -n "${SIN_DOCKER:-}" ]; then psql -v ON_ERROR_STOP=1 -qtA -d "${2:-postgres}" -c "$1"
  else docker compose exec -T db psql -v ON_ERROR_STOP=1 -qtA -U erp -d "${2:-postgres}" -c "$1"; fi
}
restaurar() {
  if [ -n "${SIN_DOCKER:-}" ]; then pg_restore --no-owner --exit-on-error -d "$PRUEBA" "$ARCHIVO"
  else docker compose exec -T db pg_restore --no-owner --exit-on-error -U erp -d "$PRUEBA" <"$ARCHIVO"; fi
}

# El resultado queda en la base de verdad (tabla latidos) para la consola de la plataforma.
# Sin Docker, la base de verdad es la de DATABASE_URL (como en copia.sh), si está.
# El -E de "set" hace que la trampa ERR también salte dentro de las funciones (pg_restore).
latido() {
  local base=erp
  if [ -n "${SIN_DOCKER:-}" ] && [ -n "${DATABASE_URL:-}" ]; then base="$DATABASE_URL"; fi
  sql "insert into latidos (nombre, ultimo, ok, detalle) values ('restauracion', now(), $1, '$2'::jsonb)
    on conflict (nombre) do update set ultimo = excluded.ultimo, ok = excluded.ok, detalle = excluded.detalle" "$base" >/dev/null || true
}
trap 'latido false "{\"error\": \"falló en la línea $LINENO\"}"' ERR

echo "Restaurando $ARCHIVO en $PRUEBA…"
sql "drop database if exists $PRUEBA"
sql "create database $PRUEBA"
trap 'sql "drop database if exists '"$PRUEBA"'" >/dev/null' EXIT
restaurar

# Controles: hay migraciones, empresas y usuarios, y las tablas tienen sus políticas de aislamiento.
MIGRACIONES=$(sql "select count(*) from drizzle.__drizzle_migrations" "$PRUEBA")
EMPRESAS=$(sql "select count(*) from empresas" "$PRUEBA")
USUARIOS=$(sql "select count(*) from usuarios" "$PRUEBA")
COMPROBANTES=$(sql "select count(*) from comprobantes" "$PRUEBA")
POLITICAS=$(sql "select count(*) from pg_policies where schemaname = 'public'" "$PRUEBA")
echo "Migraciones: $MIGRACIONES · empresas: $EMPRESAS · usuarios: $USUARIOS · comprobantes: $COMPROBANTES · políticas: $POLITICAS"
if [ "$MIGRACIONES" -lt 1 ] || [ "$EMPRESAS" -lt 1 ] || [ "$POLITICAS" -lt 10 ]; then
  echo "LA COPIA NO SIRVE: faltan datos. Revisar ya."
  latido false "{\"error\": \"faltan datos\", \"empresas\": $EMPRESAS, \"politicas\": $POLITICAS}"
  exit 2
fi
latido true "{\"archivo\": \"$(basename "$ARCHIVO")\", \"empresas\": $EMPRESAS, \"usuarios\": $USUARIOS, \"comprobantes\": $COMPROBANTES}"
echo "Restauración correcta."
