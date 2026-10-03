# Servidores: requisitos y proveedores

Qué servidor hace falta para correr Vektra ERP y cuánto crece. Los precios son orientativos (octubre de 2026, en dólares, sin impuestos): los proveedores los cambian seguido y tienen promociones, así que hay que confirmarlos al contratar.

## Qué corre

| Pieza                                    | Consumo                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Aplicación (Node 24, Next.js, en Docker) | 300 a 600 MB de RAM por proceso; picos al generar Excel, PDF o el paquete del contador               |
| Postgres 16 o más nuevo                  | Lo que más importa: RAM para caché y disco rápido (NVMe). Las fotos y archivos se guardan en la base |
| Tarea periódica                          | Un POST cada 15 minutos (`/api/cron/servicio`)                                                       |
| Correo saliente                          | Servicio SMTP externo (no se aloja)                                                                  |

Cuánto crece la base, por empresa y por año:

- Pyme que factura y controla stock: 0,2 a 1 GB.
- Con servicio técnico y fotos: 2 a 10 GB (las fotos se comprimen en el celular antes de subirse).

## Tamaños recomendados

| Etapa           | Empresas / usuarios | Aplicación                                                   | Base de datos                                      | Disco                                                                   |
| --------------- | ------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| **Arranque**    | hasta 30 / 150      | 2 vCPU, 4 GB RAM (aplicación y base en la misma VPS)         | Postgres en la misma VPS, con copias diarias fuera | 80 GB NVMe                                                              |
| **Crecimiento** | 30 a 200 / 1.000    | 2 vCPU, 4 GB RAM                                             | **Postgres administrado** aparte: 2 vCPU, 4 GB RAM | 100 a 200 GB                                                            |
| **Escala**      | más de 200          | 2 o más instancias de 2 vCPU / 4 GB detrás de un balanceador | Postgres administrado 4 vCPU / 16 GB con réplica   | 500 GB o más; mover archivos a almacenamiento de objetos (S3 o similar) |

Mínimo absoluto para probar: 1 vCPU y 2 GB de RAM (anda, pero sin margen para picos).

**Región:** lo más cerca de Argentina es **São Paulo**: unos 30 a 40 ms desde Buenos Aires, contra 130 a 180 ms desde Estados Unidos. Con muchas pantallas por día se nota.

## Proveedores

| Proveedor                                     | Para qué conviene                   | Región São Paulo                    | Costo orientativo (arranque)                                           | A favor                                                                | En contra                                                                                                                                                |
| --------------------------------------------- | ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hostinger (VPS KVM)**                       | Arrancar barato con todo en una VPS | Sí                                  | KVM 2 (2 vCPU, 8 GB, 100 GB NVMe): unos USD 9 a 15 por mes             | Muy barato y con mucha RAM                                             | No tiene Postgres administrado: copias, actualizaciones y seguridad del servidor son tuyas. El precio de renovación es mucho más alto que el promocional |
| **DigitalOcean**                              | Simplicidad, buena documentación    | **No** (lo más cerca es Nueva York) | Droplet de 4 GB: USD 24 + Postgres administrado de 4 GB: unos USD 61   | Postgres administrado con copias diarias incluidas                     | Latencia alta desde Argentina                                                                                                                            |
| **AWS** (Lightsail o EC2 + RDS)               | Crecer sin mudarse                  | Sí                                  | Lightsail de 4 GB: unos USD 24; RDS Postgres chico: USD 30 a 70        | Todo lo que vas a necesitar más adelante (S3, réplicas, balanceadores) | Facturación compleja; conviene poner alertas de gasto                                                                                                    |
| **Google Cloud** (Cloud Run o VM + Cloud SQL) | Escalar automático                  | Sí                                  | Cloud SQL Postgres chico: unos USD 50 o más; Cloud Run se paga por uso | Cloud Run escala solo y se paga por uso                                | Cloud SQL chico es caro para lo que da                                                                                                                   |

### Recomendación

1. **Para salir ya, con pocos clientes:** una **VPS en São Paulo de 2 vCPU y 8 GB** (Hostinger KVM 2 o similar) con Docker, la aplicación y Postgres en la misma máquina.
   - Usuario de copias (`erp_copias`) y `pg_dump` diario a un almacenamiento externo (por ejemplo, un bucket de S3 o Backblaze B2, centavos por mes).
   - Caddy delante para el HTTPS automático.
   - Monitor externo gratuito (Uptime Kuma, UptimeRobot) contra `/api/salud`.
   - Costo total: unos USD 15 a 25 por mes.
2. **Cuando haya clientes pagando de verdad** (o desde el día uno, si el presupuesto lo permite): pasar la base a un **Postgres administrado en São Paulo** (AWS RDS o Google Cloud SQL), que se ocupa de las copias automáticas con restauración a un momento dado, las actualizaciones y la réplica. La aplicación puede seguir en la VPS o pasar a AWS Lightsail o EC2 en la misma región.
   - Costo: unos USD 60 a 120 por mes.
3. **Evitar** hosting compartido (no corre Node ni Docker de forma confiable) y regiones de Estados Unidos o Europa (latencia).

## Servicios que se suman

| Servicio               | Opciones                            | Costo orientativo                                          |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------- |
| Dominio `.com.ar`      | NIC Argentina                       | Unos ARS 10.000 a 20.000 por año (confirmar en NIC)        |
| DNS, CDN y protección  | Cloudflare (plan gratis)            | Gratis                                                     |
| HTTPS                  | Caddy o Let's Encrypt               | Gratis                                                     |
| Correo transaccional   | Amazon SES, Brevo, Postmark, Resend | Gratis o pocos dólares hasta unos miles de correos por mes |
| Copias externas        | Backblaze B2, AWS S3                | Centavos por GB al mes                                     |
| Monitoreo              | UptimeRobot, Better Stack           | Gratis en el plan básico                                   |
| Cobro de suscripciones | Mercado Pago                        | Comisión por cobro                                         |

## Checklist del servidor (VPS propia)

- Ubuntu LTS actualizado, con actualizaciones automáticas de seguridad (`unattended-upgrades`).
- Firewall: abiertos solo 22 (SSH, con clave y sin contraseña), 80 y 443. Postgres **no** expuesto a internet.
- SSH sin root y con `fail2ban`.
- Docker con reinicio automático (`--restart unless-stopped`).
- Copias diarias fuera del servidor y una restauración probada (ver `docs/07-produccion.md`).
- `ERP_CLAVE_MAESTRA` guardada también fuera del servidor (gestor de contraseñas).
