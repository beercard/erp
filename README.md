# ERP

ERP en la nube para pymes argentinas: gestión comercial, facturación electrónica (ARCA), stock, cuentas corrientes y tesorería. Multiempresa desde el diseño: cada empresa ve solo sus datos, garantizado por la base (RLS forzado).

- [Arquitectura](docs/01-arquitectura.md)
- [Modelo de datos y etapas](docs/02-modelo-de-datos.md)
- [Diseño de la interfaz](docs/03-diseno.md)

## Desarrollo

Requiere Node 24. Sin `DATABASE_URL` usa PGlite (un Postgres embebido), así que no hay que instalar nada más.

```bash
npm install
npm run db:migrar     # crea la base local en .data/pglite
npm run db:semilla    # empresa demo; el usuario y la clave quedan en .data/credenciales-dev.txt
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas (aislamiento entre empresas, sesiones, CUIT, dinero, maestros) |
| `npm run typecheck` | Verificación de tipos |
| `npm run db:generar` | Genera una migración a partir de los cambios del esquema (revisarla antes de aplicar) |
| `npm run db:migrar` | Aplica las migraciones pendientes |

Toda tabla nueva con `empresa_id` necesita `SELECT erp_aislar_por_empresa('tabla');` en su migración. La prueba `src/db/seguridad.test.ts` falla si falta.
