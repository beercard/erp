# Puesta en producción

Qué hace falta para correr el ERP con datos reales, en qué orden y cómo comprobar que quedó bien.

## 1. Qué se necesita

| Pieza                                 | Para qué                                      | Notas                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres 16 o más nuevo**           | La base de datos                              | Administrado (con copias automáticas) mejor que propio. El usuario de la conexión tiene que ser dueño de la base y poder crear roles (`CREATEROLE`): la primera migración crea el rol `erp_app`, con el que trabaja la aplicación bajo RLS. Conviene que esté en la misma región que el servidor (para Argentina, São Paulo). |
| **Un servidor para el contenedor**    | La aplicación (Node 24)                       | Cualquier servicio que corra una imagen Docker, o una VPS con Docker. 1 GB de RAM alcanza para empezar.                                                                                                                                                                                                                       |
| **Dominio con HTTPS**                 | La dirección pública                          | Ej.: `erp.tuempresa.com.ar`. La sesión usa cookies seguras: sin HTTPS no se puede entrar.                                                                                                                                                                                                                                     |
| **Correo saliente (SMTP)**            | Avisos, invitaciones, encuestas, vencimientos | Un servicio transaccional o el SMTP del dominio. Configurar SPF y DKIM del dominio remitente para no caer en spam.                                                                                                                                                                                                            |
| **Un programador de tareas**          | La tarea periódica (`/api/cron/servicio`)     | El cron del hosting, el de la VPS o cualquier servicio externo que haga un POST cada 15 minutos.                                                                                                                                                                                                                              |
| **Certificado de ARCA de producción** | Facturar con CAE                              | Se saca con la clave fiscal de cada empresa (ver el punto 6).                                                                                                                                                                                                                                                                 |

## 2. Variables del servidor

Están todas en [`.env.example`](../.env.example). Si falta una obligatoria, el servidor **no arranca** y el registro dice cuál (ver `src/lib/arranque.ts`):

| Variable            | Obligatoria | Qué es                                                                                                                                                                                                             |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | Sí          | `postgres://usuario:clave@servidor:5432/erp?sslmode=require`                                                                                                                                                       |
| `APP_URL`           | Sí          | La dirección pública, con `https://`. Va en los enlaces de los correos y del seguimiento.                                                                                                                          |
| `ERP_CLAVE_MAESTRA` | Sí          | 32 caracteres o más (`openssl rand -base64 48`). Cifra los certificados de ARCA y las claves guardadas. **Guardarla aparte**: si se pierde, hay que volver a cargar los certificados. No cambiarla una vez en uso. |
| `CRON_SECRET`       | Sí          | 16 caracteres o más (`openssl rand -hex 24`). Protege la tarea periódica.                                                                                                                                          |
| `SMTP_URL`          | Recomendada | `smtps://usuario:clave@servidor:465`. Sin ella los correos quedan en la bandeja de salida.                                                                                                                         |
| `CORREO_REMITENTE`  | Con SMTP    | `"ERP <avisos@tuempresa.com.ar>"`                                                                                                                                                                                  |

`WEBHOOKS_PERMITIR_LOCAL`, `DATA_DIR`, `SEMILLA_*` y `PRUEBAS_POSTGRES` son de desarrollo: no van en producción.

## 3. Desplegar

**En una VPS propia (Ubuntu 24.04):** está todo armado en [`deploy/`](../deploy/LEEME.md): `instalar.sh` deja el servidor listo en un paso (firewall, SSH con clave, Docker, la aplicación con Postgres y HTTPS, la tarea periódica, la copia diaria y la prueba de restauración semanal).

**Con la imagen sola:**

```bash
docker build -t erp .
docker run -d --name erp --restart unless-stopped --env-file .env -p 3000:3000 erp
```

Al arrancar, el contenedor aplica las migraciones pendientes (`npm run db:migrar:produccion`) y levanta el servidor. Si la base no está al día o falta configuración, se detiene y lo dice en el registro. El servidor escucha en el puerto 3000; el HTTPS lo pone el hosting o un proxy delante (Caddy, nginx).

Sin Docker: `npm ci && npm run build`, después `npm run db:migrar:produccion` y `npm start` (con las variables cargadas).

**Controles:**

- `GET /api/salud` → `{"ok":true}` (200) si el servidor llega a la base; 503 si no. Para el monitor del hosting.
- La imagen trae su propio `HEALTHCHECK` con esa ruta.

## 4. Primer ingreso

1. Entrar a `https://…/registro` y crear la cuenta y la primera empresa (queda con 30 días de prueba).
2. Darse permiso de administrar la plataforma (planes, suscripciones, empresas):

   ```bash
   DATABASE_URL=… npm run plataforma:admin -- persona@empresa.com
   # en el contenedor: docker exec erp node scripts/admin-plataforma.mjs persona@empresa.com
   ```

3. En la empresa: Configuración › Empresa (datos fiscales), Configuración › ARCA (certificado) y Configuración › Usuarios y roles (invitar al equipo).

## 5. Tarea periódica

Cada 15 minutos:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://erp.tuempresa.com.ar/api/cron/servicio
```

Pone al día órdenes vencidas, preventivos, avisos, SLA y recordatorios; avisa los vencimientos impositivos; hace los asientos automáticos; manda los correos y los webhooks. Devuelve un resumen (`{"empresas":…,"enviados":…,"errores":0}`). Sin `CRON_SECRET`, o con otro, contesta 401. Si `errores` no es 0, revisar el registro del servidor.

## 6. ARCA en producción

1. Empezar por **homologación** (Configuración › ARCA explica cómo sacar el certificado de prueba) y emitir algunos comprobantes de prueba.
2. Para producción: certificado desde "Administración de Certificados Digitales" y autorización del servicio `wsfe` en el Administrador de Relaciones, con la clave fiscal de la empresa.
3. Crear un **punto de venta nuevo, exclusivo** para el ERP (tipo "RECE / Factura electrónica – Web Services").
4. Subir el `.crt` y el `.key` en Configuración › ARCA, pasar a producción y probar la conexión.
5. Emitir la primera factura real por un importe chico y verificarla en "Mis Comprobantes".

Antes de la primera presentación real del Libro IVA Digital y del SICORE, generar los archivos de un mes de prueba y validarlos con los aplicativos de ARCA.

## 7. Copias de seguridad

- **Automáticas del proveedor**: activar la restauración a un momento dado (PITR) si la ofrece. Son copias físicas: no las afecta RLS.
- **Propias, diarias**, guardadas fuera del proveedor de la base. Ojo: `pg_dump` con el usuario dueño **falla** ("query would be affected by row-level security policy"), porque las tablas tienen RLS forzado también para el dueño (así una consulta que se saltee los controles no ve nada). No se afloja eso: se usa un usuario solo para copias, que lee todo sin RLS. Lo crea un superusuario (en un servicio administrado, el usuario administrador que da el proveedor):

  ```sql
  CREATE ROLE erp_copias LOGIN PASSWORD '…' BYPASSRLS;
  GRANT pg_read_all_data TO erp_copias;   -- solo lectura
  ```

  ```bash
  pg_dump --format=custom --no-owner "postgres://erp_copias:…@servidor:5432/erp" > erp-$(date +%F).dump
  ```

  Si el proveedor no permite `BYPASSRLS`, quedan sus copias automáticas (y conviene exportarlas periódicamente con su herramienta).

- **Probar la restauración** al menos una vez antes de cargar datos reales, en una base aparte. En otro servidor de Postgres hay que crear antes el rol de la aplicación (en el mismo servidor ya existe):

  ```sql
  CREATE ROLE erp_app NOLOGIN;
  GRANT erp_app TO usuario_dueño;
  ```

  ```bash
  createdb erp_restaurada && pg_restore --no-owner -d erp_restaurada erp-AAAA-MM-DD.dump
  ```

  Se probó así: la base restaurada queda igual (datos, permisos de `erp_app`, RLS forzado en las 105 tablas e historial de migraciones) y el aislamiento entre empresas sigue funcionando.

- `ERP_CLAVE_MAESTRA` va guardada aparte de las copias: con la copia sola no se pueden leer los certificados.

## 8. Seguridad

- La aplicación trabaja con el rol `erp_app`, sin dueño de tablas: RLS aísla las empresas y los grupos de clientes aunque una consulta se olvide de filtrar.
- No usar el usuario dueño de la base para nada más que migrar y las copias.
- Las claves de APIs de terceros (Persat, etc.) van como variables del servidor, nunca en el repositorio. La de Persat que se usó para el relevamiento **hay que rotarla** antes de producción.

## 9. Lista de control

- [ ] Postgres creado, usuario con `CREATEROLE`, en la región del servidor.
- [ ] Variables cargadas; `ERP_CLAVE_MAESTRA` guardada en lugar seguro.
- [ ] Contenedor arriba; `/api/salud` da 200.
- [ ] Dominio con HTTPS; se puede entrar.
- [ ] Cuenta creada y `plataforma:admin` aplicado.
- [ ] Tarea periódica cada 15 minutos; la primera respuesta con `errores: 0`.
- [ ] Correo de prueba recibido (por ejemplo, invitar a alguien).
- [ ] ARCA: homologación probada; certificado de producción y punto de venta nuevo; primera factura verificada.
- [ ] Usuario `erp_copias`, copia diaria programada y una restauración probada.
- [ ] Clave de Persat rotada.

## 10. Probar contra Postgres en desarrollo

Todo lo de arriba se probó con un Postgres 16 local y un usuario sin superusuario (como en un servicio administrado). Las pruebas también pueden correr ahí:

```bash
PRUEBAS_POSTGRES=postgres://erp:erp@localhost:5432/erp npm test
```

Cada archivo de pruebas crea su base (`erp_prueba_…`); el usuario necesita `CREATEDB`.

## 11. Monitoreo

- `GET /api/salud`: servidor y base. `GET /api/salud?cron=1`: además, 503 si la tarea periódica no corre hace más de 45 minutos (para un monitor externo).
- Errores del servidor (páginas, rutas y acciones): se agrupan por huella y se ven en el panel de la plataforma; se avisan por correo a `AVISOS_ADMIN` (o a quienes administran la plataforma) como mucho cada 6 horas por error. Código: `src/modulos/plataforma/monitoreo.ts` y `src/instrumentation.ts`.

## 12. Pruebas automáticas

- En cada push, GitHub Actions (`.github/workflows/ci.yml`) corre tipos, estilo, pruebas, compilación y los recorridos en navegador.
- Recorridos en navegador (`e2e/`): `npx playwright test`. Levanta su propio servidor con una base nueva, los datos de demostración y **ARCA simulado** (`ARCA_SIMULADO=1`, que en producción se ignora). Con un Chromium ya instalado: `PW_CHROMIUM=/ruta/chrome npx playwright test`.
