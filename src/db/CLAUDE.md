# src/db — esquema, conexión y aislamiento

Detalle y plantillas: skill `erp-esquema-migraciones`.

- `empresa.ts`: `conEmpresa` fija `app.empresa_id` (y `app.usuario_id`), baja al rol `erp_app` y abre la transacción. Es la única puerta a los datos de una empresa. `comoPlataforma` sirve solo para tablas de plataforma.
- `conexion.ts`: Postgres con `DATABASE_URL`, si no PGlite en `.data/pglite`. Para SQL crudo usá ``filas<T>(await tx.execute(sql`…`))`` (PGlite y postgres-js devuelven distinto).
- `schema/comunes.ts`: `id()`, `empresaId()` (default = empresa de la transacción), `marcasDeTiempo()`, `importe` (18,2), `precio`/`cantidad` (18,4), `cotizacion` (18,6).
- Tabla de empresa nueva: `empresaId()`, únicos que incluyen `empresa_id`, FK compuestas con el `deLaEmpresa` local del archivo, `unique('<tabla>_empresa_id').on(t.empresaId, t.id)` si otras la referencian, y `erp_aislar_por_empresa` en la migración `_seguridad`.
- `seguridad.test.ts` falla si una tabla con `empresaId()` queda sin RLS forzado; el set `PLATAFORMA` lista las excepciones (agregar ahí es una decisión de seguridad, no un atajo).
- `pruebas.ts`: `baseDePrueba()` crea una base con todas las migraciones por archivo de prueba (`PRUEBAS_POSTGRES` para Postgres real).
- Ver tablas sin abrir los esquemas: `node .claude/skills/erp-contexto/scripts/tablas.mjs [filtro]`.
