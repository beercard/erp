# Instalar Vektra ERP en una VPS

Para una VPS **Ubuntu 24.04** (por ejemplo, Hostinger KVM 2 en São Paulo). Todo corre en Docker: la aplicación, Postgres 16, Caddy (HTTPS automático) y la tarea periódica.

## Antes de empezar

1. **Dominio:** creá un registro DNS `A` del dominio (por ejemplo `erp.tuempresa.com.ar`) apuntado al IP de la VPS. Si usás Cloudflare, dejalo en "solo DNS" (nube gris) hasta que Caddy saque el certificado.
2. **Clave SSH:** en tu computadora, `ssh-keygen -t ed25519` y copiá el contenido de `~/.ssh/id_ed25519.pub`.
3. **Token de GitHub de solo lectura** para clonar el repositorio privado: GitHub → Settings → Developer settings → Fine-grained tokens → acceso solo a `beercard/erp`, permiso _Contents: Read-only_. No queda guardado en el servidor.

## Instalación (una sola vez)

Entrá como root (`ssh root@IP`), copiá `deploy/instalar.sh` al servidor (con `scp` o pegándolo) y corré:

```bash
bash instalar.sh erp.tuempresa.com.ar vektra "ssh-ed25519 AAAA… tu@compu" main
```

El instalador:

- Prepara Ubuntu (`preparar-ubuntu.sh`): actualizaciones automáticas de seguridad, firewall con 22/80/443, fail2ban, Docker, swap, el usuario `vektra` con tu clave y **SSH sin contraseña y sin root**.
- Clona el repositorio en `/home/vektra/erp` y genera `deploy/.env` con claves nuevas.
- Levanta todo con `docker compose up -d --build` (la primera compilación tarda unos minutos).
- Programa la copia diaria (3:15) y la prueba de restauración (domingos 4:45).

> **Importante:** antes de cerrar la sesión de root, abrí otra terminal y probá `ssh vektra@IP`. Desde ahí root ya no entra por SSH.

## Después de instalar

1. **Guardá `deploy/.env` fuera del servidor**, en un gestor de contraseñas. Lo más importante es `ERP_CLAVE_MAESTRA`: si se pierde, hay que volver a cargar los certificados de ARCA y las claves de las integraciones.
2. **Tu cuenta:** registrate en `https://dominio/registro` y hacete administrador de la plataforma:

   ```bash
   cd ~/erp/deploy && docker compose exec app node scripts/admin-plataforma.mjs tu@correo.com
   ```

3. **Correo saliente:** completá `SMTP_URL` y `CORREO_REMITENTE` en `deploy/.env` (Brevo, Amazon SES, Resend; con SPF y DKIM del dominio) y aplicá con `docker compose up -d`.
4. **Copias fuera del servidor:** configurá un destino con `rclone config` (por ejemplo, un bucket de Backblaze B2) y poné `RCLONE_DESTINO=b2:nombre-del-bucket` en `deploy/.env`. Sin esto, las copias quedan solo en la VPS.
5. **Monitores externos** (UptimeRobot o Uptime Kuma, gratis):
   - `https://dominio/api/salud`: servidor y base (cada 5 minutos).
   - `https://dominio/api/salud?cron=1`: la tarea periódica; da 503 si no corre hace 45 minutos.
   - Opcional: un "heartbeat" para las copias, con su URL en `COPIA_AVISO_URL`.
6. **Errores del servidor:** se agrupan en el panel de la plataforma (Salud del servicio) y se avisan por correo a `AVISOS_ADMIN` (o a quienes administran la plataforma), como mucho cada 6 horas por error.

## Un subdominio por empresa (komsa.erp.tuempresa.com.ar)

Cada empresa entra por su dirección, con su propia pantalla de ingreso y su propia sesión. El dominio de `DOMINIO` queda para el sitio comercial, el ingreso con el código de empresa y el panel de la plataforma.

1. **DNS comodín:** en el DNS del dominio, un registro `A` con nombre `*.erp` (para `*.erp.tuempresa.com.ar`) apuntando al IP de la VPS. En Hostinger: Dominios → DNS / Nameservers → Agregar registro → Tipo A, Nombre `*.erp`, Apunta a el IP.
2. **Activar:** en `deploy/.env`, `DOMINIO_EMPRESAS=erp.tuempresa.com.ar` (normalmente igual a `DOMINIO`), y aplicar con `git pull && docker compose up -d --build`.
3. **Certificados:** Caddy saca uno por subdominio la primera vez que alguien entra (tarda unos segundos), solo si el ERP confirma que esa empresa existe (`/api/dominio`).
4. **Códigos:** las empresas que ya estaban recibieron uno a partir de su nombre; las nuevas, al darse de alta. Se ven y se cambian en el panel de la plataforma → la empresa → "Dirección de ingreso".

Sin `DOMINIO_EMPRESAS` todo sigue como antes: todas las empresas entran por `DOMINIO` y eligen con cuál trabajar.

## Operación

| Qué                                  | Comando (en `~/erp/deploy`)                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actualizar a la última versión       | `git pull && docker compose up -d --build`                                                                                                                                                            |
| Ver el registro                      | `docker compose logs -f app`                                                                                                                                                                          |
| Estado                               | `docker compose ps`                                                                                                                                                                                   |
| Copia a mano                         | `./copia.sh`                                                                                                                                                                                          |
| Probar la última copia               | `./probar-restauracion.sh`                                                                                                                                                                            |
| Restaurar una copia (¡pisa la base!) | `docker compose stop app tarea && docker compose exec -T db pg_restore --clean --if-exists --no-owner -U erp -d erp < /var/backups/vektra/erp-AAAA-MM-DD-HHMM.dump && docker compose start app tarea` |

Las migraciones de la base se aplican solas al arrancar la aplicación.
