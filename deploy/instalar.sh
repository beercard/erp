#!/usr/bin/env bash
# Instalación de Vektra ERP en una VPS Ubuntu 24.04 nueva, en un solo paso.
# Correr como root en el servidor:
#
#   curl -fsSL https://raw.githubusercontent.com/beercard/erp/main/deploy/instalar.sh -o instalar.sh
#   bash instalar.sh <dominio> <usuario> "<clave SSH pública>" [rama]
#
# El repositorio es privado: si curl no lo baja, copiá el archivo con scp.
# Pide (o toma de GITHUB_TOKEN) un token de GitHub de solo lectura para clonar.
#
# Hace: prepara Ubuntu (firewall, SSH con clave, fail2ban, Docker, swap),
# clona el repositorio en /home/<usuario>/erp, genera deploy/.env con claves
# nuevas, levanta todo con HTTPS, programa la copia diaria y crea el
# administrador de la plataforma.
set -euo pipefail

DOMINIO="${1:?Uso: bash instalar.sh <dominio> <usuario> \"<clave SSH pública>\" [rama]}"
USUARIO="${2:?Falta el usuario de operación (ej.: vektra)}"
CLAVE_SSH="${3:?Falta la clave SSH pública}"
RAMA="${4:-main}"
[ "$(id -u)" -eq 0 ] || { echo "Correr como root."; exit 1; }

DIR="/home/$USUARIO/erp"
TMP=$(mktemp -d)

# 1. El repositorio (privado): con un token de lectura.
if [ ! -d "$DIR/.git" ]; then
  apt-get update -qq && apt-get install -y -qq git >/dev/null
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    read -r -s -p "Token de GitHub (solo lectura del repositorio beercard/erp): " GITHUB_TOKEN
    echo
  fi
  git clone --branch "$RAMA" "https://x-access-token:${GITHUB_TOKEN}@github.com/beercard/erp.git" "$TMP/erp"
  # El token no queda guardado en el servidor.
  git -C "$TMP/erp" remote set-url origin https://github.com/beercard/erp.git
fi

# 2. Ubuntu: firewall, SSH, Docker, usuario.
SCRIPT_PREPARAR="$DIR/deploy/preparar-ubuntu.sh"
[ -f "$SCRIPT_PREPARAR" ] || SCRIPT_PREPARAR="$TMP/erp/deploy/preparar-ubuntu.sh"
bash "$SCRIPT_PREPARAR" "$USUARIO" "$CLAVE_SSH"
if [ ! -d "$DIR/.git" ]; then
  mv "$TMP/erp" "$DIR"
  chown -R "$USUARIO:$USUARIO" "$DIR"
fi
rm -rf "$TMP"

# 3. Variables: claves nuevas (se generan acá y no salen del servidor).
ENV="$DIR/deploy/.env"
if [ ! -f "$ENV" ]; then
  cp "$DIR/deploy/env.ejemplo" "$ENV"
  sed -i "s|^DOMINIO=.*|DOMINIO=$DOMINIO|; s|^APP_URL=.*|APP_URL=https://$DOMINIO|" "$ENV"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" "$ENV"
  sed -i "s|^ERP_CLAVE_MAESTRA=.*|ERP_CLAVE_MAESTRA=$(openssl rand -base64 48 | tr -d '\n')|" "$ENV"
  sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 24)|" "$ENV"
  chown "$USUARIO:$USUARIO" "$ENV"
  chmod 600 "$ENV"
fi

# 4. Levantar (la primera compilación tarda unos minutos).
sudo -u "$USUARIO" bash -c "cd '$DIR/deploy' && docker compose up -d --build"

# 5. Copia diaria a las 3:15 y prueba de restauración los domingos.
CRON="15 3 * * * $DIR/deploy/copia.sh >> /var/log/vektra/copias.log 2>&1
45 4 * * 0 $DIR/deploy/probar-restauracion.sh >> /var/log/vektra/restauracion.log 2>&1"
install -d -m 750 -o "$USUARIO" -g "$USUARIO" /var/log/vektra
( crontab -u "$USUARIO" -l 2>/dev/null | grep -v 'deploy/copia.sh\|deploy/probar-restauracion.sh'; echo "$CRON" ) | crontab -u "$USUARIO" -

echo
echo "Esperando que la aplicación responda…"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMINIO/api/salud" >/dev/null 2>&1; then
    echo "Listo: https://$DOMINIO"
    echo
    echo "Pasos que quedan (ver deploy/LEEME.md):"
    echo "  1. Guardá deploy/.env fuera del servidor (sobre todo ERP_CLAVE_MAESTRA)."
    echo "  2. Creá tu cuenta en https://$DOMINIO/registro y hacete administrador:"
    echo "       cd $DIR/deploy && docker compose exec app node scripts/admin-plataforma.mjs tu@correo.com"
    echo "  3. Completá SMTP_URL y RCLONE_DESTINO en deploy/.env y reiniciá: docker compose up -d"
    exit 0
  fi
  sleep 10
done
echo "La aplicación todavía no responde en https://$DOMINIO. Revisá que el dominio apunte a este IP y mirá: docker compose logs app caddy"
exit 1
