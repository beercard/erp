---
name: erp-esquema-migraciones
description: Cómo agregar o cambiar tablas, columnas, índices, claves foráneas y políticas en la base del ERP (Drizzle ORM + Postgres con RLS forzado por empresa) y generar sus migraciones versionadas en drizzle/. Usala siempre que toques src/db/schema, la carpeta drizzle/, crees una tabla nueva, agregues empresa_id, una FK, un índice único, una política de grupos de clientes, permisos del rol erp_app, datos de catálogos fiscales o una migración de datos — aunque el pedido no diga "migración" (por ejemplo "guardá también la fecha de X" o "agregá un campo").
---

# Esquema y migraciones

## Por qué importa
Una sola base para todas las empresas. Lo que separa a una empresa de otra **es la base**, no el código:
cada tabla de negocio tiene `empresa_id` con RLS **forzado**, la app trabaja con el rol `erp_app` (que no es
dueño de las tablas) y cada transacción fija `app.empresa_id` (`src/db/empresa.ts`). Una tabla mal declarada
es una fuga de datos entre clientes del SaaS. `src/db/seguridad.test.ts` recorre todas las tablas y falla si
alguna quedó sin aislar.

## Pasos para una tabla nueva de empresa

1. **Esquema** en el archivo del área (`src/db/schema/<area>.ts`; si es un archivo nuevo, exportalo en `index.ts`).
   Usá los helpers de `comunes.ts`:

   ```ts
   import { date, index, integer, pgTable, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
   import { empresaId, id, importe, marcasDeTiempo } from './comunes'
   import { terceros } from './maestros'
   // deLaEmpresa: helper local del archivo (copiá el de cobranza.ts si el archivo es nuevo)

   /** Para qué existe la tabla (en español, el porqué). */
   export const valesCaja = pgTable(
     'vales_caja',
     {
       id: id(),
       empresaId: empresaId(), // default = app.empresa_id: un alta nunca cae en otra empresa
       numero: integer('numero').notNull(),
       terceroId: uuid('tercero_id'),
       importe: importe('importe').notNull(), // numeric(18,2) → string en TS
       fecha: date('fecha').notNull(), // fecha de negocio: string 'AAAA-MM-DD'
       ...marcasDeTiempo(),
     },
     (t) => [
       uniqueIndex().on(t.empresaId, t.numero), // todo lo "único" es único POR EMPRESA
       index().on(t.empresaId, t.terceroId),
       unique('vales_caja_empresa_id').on(t.empresaId, t.id), // destino de FK compuestas
       deLaEmpresa('vales_caja_tercero_fk', t.empresaId, t.terceroId, terceros),
     ],
   )
   ```
   - Escalas: `importe` (18,2), `precio`/`cantidad` (18,4), `cotizacion` (18,6). Nunca `real`/`doublePrecision` para plata.
   - FK hacia otra tabla de empresa: **compuesta** `(empresa_id, id)` con el helper local `deLaEmpresa` (cada archivo
     de esquema tiene el suyo). Así la base rechaza referenciar una fila de otra empresa. La tabla destino necesita
     `unique('<tabla>_empresa_id').on(t.empresaId, t.id)`.
   - Nombrá explícito los índices/constraints que el código va a reconocer en errores: los módulos hacen
     `mensajeDeBase(e).includes('articulos_empresa_id_codigo')` para devolver un error por campo.
   - Columnas e identificadores en español y `snake_case` en la base (Drizzle usa `casing: 'snake_case'`).
   - JSDoc en cada columna no obvia: es la documentación del modelo.

2. **Migración generada**: `npm run db:generar -- --name <area_cambio>` → crea `drizzle/NNNN_<nombre>.sql` +
   snapshot. **Leé el SQL** (no el snapshot): que no haya `DROP` inesperados, que los defaults y FK sean los
   pensados. Si drizzle-kit pregunta por renombres (prompt interactivo), resolvelo con quien pidió el cambio.

3. **Migración de seguridad** (custom): `npx drizzle-kit generate --custom --name <area_cambio>_seguridad` y escribí:
   ```sql
   -- <Área>: aislamiento por empresa.
   SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['vales_caja', 'vales_caja_items']::regclass[]) AS t;
   ```
   `erp_aislar_por_empresa` (definida en `0001_seguridad.sql`) habilita y fuerza RLS, crea la política
   `aislamiento_empresa` (USING + WITH CHECK) y la FK a `empresas`.

4. **¿Cuelga de un cliente?** Si la tabla depende de `terceros`, órdenes de servicio, equipos o contratos y un usuario
   con grupos de clientes no debería verla, sumá en la misma migración de seguridad una política restrictiva
   (modelo en `0048_grupos_clientes_seguridad.sql` y `0055_endurecimiento.sql`):
   ```sql
   CREATE POLICY visibilidad_grupos ON vales_caja AS RESTRICTIVE
     USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
   ```
   Comprobantes y recibos **no** se filtran por grupo (decisión de producto, ver docs/01 §2).

5. **Aplicar y probar**: `npm run db:migrar` (PGlite en `.data/pglite`) y
   `npx vitest run src/db/seguridad.test.ts` + las pruebas del módulo (ver skill `erp-verificar`).

6. **Documentar**: agregá la tabla a `docs/02-modelo-de-datos.md` (o al doc del área).

## Otros casos

| Caso | Qué hacer |
|---|---|
| Columna nueva en tabla existente | Solo paso 1-2. Si es de dinero: `importe(...)` con `.notNull().default('0')` o nullable con criterio. |
| Columna nueva en `usuarios` que la app escribe | `0055` dejó UPDATE por columna: agregá `GRANT UPDATE (<col>) ON usuarios TO erp_app;` |
| Tabla de **plataforma** (sin RLS: usuarios, sesiones, suscripciones…) | Sin `empresaId()`. Si igual guarda `empresa_id`, sumala al set `PLATAFORMA` de `seguridad.test.ts` y **toda** consulta la filtra a mano (como `src/modulos/empresa/usuarios.ts`). Pensalo dos veces: casi siempre corresponde RLS. |
| Catálogo fiscal global (códigos de ARCA) | Sin `empresa_id`; datos con `INSERT` en la migración; `REVOKE INSERT, UPDATE, DELETE ON <tabla> FROM erp_app;` |
| Migración de datos | SQL en la migración (ver `0084_codigo_empresa.sql`, `0086_rubro_empresa.sql`), idempotente si se puede (`WHERE ... IS NULL`, `NOT (... = ANY(...))`). |
| Índice único parcial / por expresión | En SQL a mano dentro de una migración custom (ej. `0055`, punto 1). |
| Trigger o función | Migración custom; nombres con prefijo `erp_`. |

## Reglas que no se negocian
- **Nunca** `drizzle-kit push` ni sincronizar contra una base: siempre generar → revisar → versionar → `db:migrar`.
- **Nunca** editar ni renumerar una migración ya commiteada (otros entornos ya la aplicaron). Corregí con una nueva.
  Si al mergear dos ramas chocan números, renumerá **la tuya** aún no mergeada (ver commit `83b1974`).
- No abras `drizzle/meta/*_snapshot.json` (~22.000 líneas): para saber el último número, `ls drizzle/*.sql | tail -1`.
- La app nunca crea tablas ni cambia permisos en tiempo de ejecución.

## Postgres real vs PGlite
Dev y pruebas usan PGlite (Postgres en WASM); producción, Postgres 16+. Diferencias que ya mordieron:
- `` db.execute(sql`...`) `` devuelve `{ rows }` en PGlite y un array en postgres-js → usá `filas<T>(r)` de `src/db/conexion.ts`.
- Fechas `Date` dentro de `` sql`...` `` se serializan a ISO en `conectarPostgres`; no inventes otra conversión.
- Para probar contra Postgres real: `PRUEBAS_POSTGRES=postgres://usuario@host/postgres npx vitest run` (crea una base por archivo).

## Checklist antes de terminar
- [ ] `empresaId()` + `erp_aislar_por_empresa` en migración `_seguridad` (o justificada como plataforma/global)
- [ ] FK compuestas con `deLaEmpresa` y `unique('<tabla>_empresa_id')` en el destino
- [ ] Únicos incluyen `empresa_id`; constraints que el código reconoce tienen nombre explícito
- [ ] Dinero en `numeric` con los helpers; fechas de negocio en `date`
- [ ] SQL generado revisado; `seguridad.test.ts` y pruebas del módulo pasan
- [ ] `docs/02-modelo-de-datos.md` (o doc del área) actualizado
