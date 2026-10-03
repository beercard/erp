#!/usr/bin/env bash
# Preparación de una VPS Ubuntu 24.04 recién creada para Vektra ERP.
# Correr una sola vez, como root:   bash deploy/preparar-ubuntu.sh <usuario> "<clave SSH pública>"
#
# - Actualiza el sistema y deja las actualizaciones de seguridad automáticas.
# - Firewall: solo SSH (22), HTTP (80) y HTTPS (443).
# - fail2ban contra intentos de ingreso por SSH.
# - Docker y Docker Compose (si no están).
# - Un usuario sin root para operar, con la clave SSH; SSH sin contraseña y sin root.
# - Swap de 2 GB (margen para los picos de la compilación).
set -euo pipefail

USUARIO="${1:?Uso: bash preparar-ubuntu.sh <usuario> \"<clave SSH pública>\"}"
CLAVE="${2:?Falta la clave SSH pública (ssh-ed25519 …)}"
[ "$(id -u)" -eq 0 ] || { echo "Correr como root."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw fail2ban unattended-upgrades postgresql-client rclone
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker (repositorio oficial) si no viene en la plantilla.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# Usuario de operación.
if ! id "$USUARIO" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$USUARIO"
fi
usermod -aG docker,sudo "$USUARIO"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
grep -qxF "$CLAVE" "/home/$USUARIO/.ssh/authorized_keys" 2>/dev/null || echo "$CLAVE" >>"/home/$USUARIO/.ssh/authorized_keys"
chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys"
chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
echo "$USUARIO ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$USUARIO"

# SSH: solo con clave, sin root.
cat >/etc/ssh/sshd_config.d/90-vektra.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
systemctl reload ssh || systemctl reload sshd

# Firewall.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

# Swap.
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# Carpeta de copias locales.
install -d -m 750 -o "$USUARIO" -g "$USUARIO" /var/backups/vektra

echo
echo "Listo. Desde ahora entrar con: ssh $USUARIO@<IP>   (root ya no entra por SSH)."
echo "Siguiente paso: deploy/LEEME.md"
