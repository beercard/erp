# ERP

ERP en la nube para pymes argentinas: gestión comercial, facturación electrónica (ARCA), stock, cuentas corrientes y tesorería. Multiempresa desde el diseño: cada empresa ve solo sus datos, garantizado por la base (RLS forzado).

- [Arquitectura](docs/01-arquitectura.md)
- [Modelo de datos y etapas](docs/02-modelo-de-datos.md)
- [Impuestos e informes (etapa 6)](docs/05-impuestos-e-informes.md)
- [Contabilidad (etapa 7)](docs/06-contabilidad.md)
- [Puesta en producción](docs/07-produccion.md)
- [Diseño de la interfaz](docs/03-diseno.md)

## Desarrollo

Requiere Node 24. Sin `DATABASE_URL` usa PGlite (un Postgres embebido), así que no hay que instalar nada más.

```bash
npm install
npm run db:migrar     # crea la base local en .data/pglite
npm run db:semilla    # empresa demo; el usuario y la clave quedan en .data/credenciales-dev.txt
npm run dev
```

| Comando              | Qué hace                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- |
| `npm test`           | Pruebas (aislamiento entre empresas, sesiones, CUIT, dinero, maestros)                |
| `npm run typecheck`  | Verificación de tipos                                                                 |
| `npm run db:generar` | Genera una migración a partir de los cambios del esquema (revisarla antes de aplicar) |
| `npm run db:migrar`  | Aplica las migraciones pendientes                                                     |

Toda tabla nueva con `empresa_id` necesita `SELECT erp_aislar_por_empresa('tabla');` en su migración. La prueba `src/db/seguridad.test.ts` falla si falta.

## Importar desde PYMEXIS

Con el servidor detenido (PGlite no se comparte entre procesos), a partir de la exportación de maestros que genera el agente de KOMSA:

```bash
npx tsx scripts/importar-pymexis.ts <carpeta-con-los-csv> --cuit 30715974823 --razon "KOMSA S.A."
```

Se puede correr las veces que haga falta: actualiza por código y no duplica. Mientras PYMEXIS sea el sistema en uso, el stock del ERP lo sigue: la primera vez carga el saldo inicial y después agrega ajustes "Sincronización con PYMEXIS" por la diferencia. Los movimientos hechos en el ERP sobre artículos de PYMEXIS quedan compensados por ese ajuste.

## Variables del servidor

| Variable                  | Para qué                                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | Postgres de producción. Sin ella se usa PGlite en `.data/`.                                                                                                                                                                                                     |
| `ERP_CLAVE_MAESTRA`       | Cifra las claves privadas de ARCA (al menos 32 caracteres). Si se pierde, hay que volver a subir los certificados. No va en la base ni en git.                                                                                                                  |
| `APP_URL`                 | Dirección pública del sistema (https://…), para los enlaces de los correos y de la encuesta de satisfacción.                                                                                                                                                    |
| `SMTP_URL`                | Servidor de correo (smtp://usuario:clave@servidor:587). Sin ella los correos quedan en la bandeja de salida.                                                                                                                                                    |
| `CORREO_REMITENTE`        | Remitente de los correos, por ejemplo "Servicio técnico <avisos@empresa.com.ar>".                                                                                                                                                                               |
| `CRON_SECRET`             | Clave de la tarea programada `POST /api/cron/servicio` (Authorization: Bearer …), que conviene llamar cada 15 a 60 minutos: vencimientos, preventivos, avisos, alertas de SLA, recordatorios, avisos de vencimientos impositivos y envío de correos y webhooks. |
| `WEBHOOKS_PERMITIR_LOCAL` | Solo desarrollo y pruebas: deja mandar webhooks por http y a direcciones internas (localhost, red privada). En producción no se carga.                                                                                                                          |
