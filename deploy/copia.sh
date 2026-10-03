#!/usr/bin/env bash
# Copia de la base de Vektra ERP (pg_dump comprimido) con verificación,
# retención y envío opcional fuera del servidor. Pensado para el cron diario:
#
#   15 3 * * * /home/vektra/erp/deploy/copia.sh >> /var/log/vektra-copias.log 2>&1
#
# Variables (en deploy/.env o en el entorno):
#   COPIAS_DIR         carpeta local (por defecto /var/backups/vektra)
#   COPIAS_DIAS        días que se guardan en el servidor (por defecto 14)
#   RCLONE_DESTINO     destino externo de rclone (ej.: b2:vektra-copias); recomendado
#   COPIA_AVISO_URL    URL a la que se avisa que la copia salió bien (Healthchecks.io, UptimeRobot heartbeat)
#   SIN_DOCKER=1       usar pg_dump local con DATABASE_URL (pruebas o Postgres administrado)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

DIR="${COPIAS_DIR:-/var/backups/vektra}"
DIAS="${COPIAS_DIAS:-14}"
mkdir -p "$DIR"
ARCHIVO="$DIR/erp-$(date +%F-%H%M).dump"

# Deja el resultado en la base (tabla latidos) para la consola de la plataforma
# (Operación). Si no se puede, la copia sigue igual.
latido() {
  local q="insert into latidos (nombre, ultimo, ok, detalle) values ('copia', now(), $1, '$2'::jsonb)
    on conflict (nombre) do update set ultimo = excluded.ultimo, ok = excluded.ok, detalle = excluded.detalle"
  if [ -n "${SIN_DOCKER:-}" ]; then psql -qtA "$DATABASE_URL" -c "$q" >/dev/null
  else docker compose exec -T db psql -qtA -U erp -d erp -c "$q" >/dev/null; fi
}
trap 'latido false "{\"error\": \"falló en la línea $LINENO\"}" || true' ERR

volcar() {
  if [ -n "${SIN_DOCKER:-}" ]; then
    pg_dump --format=custom --no-owner "$DATABASE_URL"
  else
    docker compose exec -T db pg_dump --format=custom --no-owner -U erp erp
  fi
}

echo "[$(date -Is)] Copia: $ARCHIVO"
volcar >"$ARCHIVO.parcial"
# Una copia que no se puede leer no es una copia: se lista antes de darla por buena.
pg_restore --list "$ARCHIVO.parcial" >/dev/null
mv "$ARCHIVO.parcial" "$ARCHIVO"
echo "[$(date -Is)] Tamaño: $(du -h "$ARCHIVO" | cut -f1)"

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$ARCHIVO" "$RCLONE_DESTINO"
  echo "[$(date -Is)] Enviada a $RCLONE_DESTINO"
else
  echo "[$(date -Is)] AVISO: sin RCLONE_DESTINO la copia queda solo en este servidor."
fi

find "$DIR" -name 'erp-*.dump' -mtime "+$DIAS" -delete
latido true "{\"archivo\": \"$(basename "$ARCHIVO")\", \"tamano\": \"$(du -h "$ARCHIVO" | cut -f1)\", \"externa\": $([ -n "${RCLONE_DESTINO:-}" ] && echo true || echo false)}" || true
[ -n "${COPIA_AVISO_URL:-}" ] && curl -fsS -m 20 "$COPIA_AVISO_URL" >/dev/null || true
echo "[$(date -Is)] Listo."
