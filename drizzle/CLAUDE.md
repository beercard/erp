# drizzle — migraciones versionadas

Detalle: skill `erp-esquema-migraciones`.

- Se generan con `npm run db:generar -- --name <nombre>` (desde `src/db/schema`) y se aplican con `npm run db:migrar`. Nunca `drizzle-kit push`.
- Las de seguridad son custom: `npx drizzle-kit generate --custom --name <nombre>_seguridad` con `SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[...]::regclass[]) AS t;` y, si cuelga de un cliente, la política `visibilidad_grupos`.
- Una migración commiteada no se edita ni se renumera: se corrige con otra. Si chocan números al mergear `main`, se renumera la propia todavía no mergeada.
- `0001_seguridad.sql` define `erp_app`, `erp_aislar_por_empresa` y la auditoría inmutable; `0048`/`0055` las políticas de grupos de clientes; `0002` los catálogos fiscales.
- No abrir `meta/*_snapshot.json` (~22.000 líneas cada uno). Último número: `ls drizzle/*.sql | tail -1`.
