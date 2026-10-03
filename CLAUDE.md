@AGENTS.md

# Vektra ERP — guía para Claude

ERP SaaS multiempresa para pymes argentinas: facturación electrónica ARCA, ventas, stock, compras, tesorería,
impuestos, contabilidad, contratos, servicio técnico, CRM, tiendas online, cobros online y WhatsApp con IA.
Todo en español: dominio, tablas, código, UI y docs.

**Stack:** Next.js 16.3 (App Router, Server Actions, `src/proxy.ts` en lugar de middleware) · React 19.2 · TypeScript
estricto · Drizzle 0.45 + Postgres (PGlite embebido en dev y pruebas) · Tailwind 4 con tokens · Zod 4 · decimal.js ·
Vitest 5 · Playwright · Node ≥ 24.

## Comandos
```bash
npm install && npm run db:migrar && npm run db:semilla && npm run dev   # local; credenciales en .data/credenciales-dev.txt
node .claude/skills/erp-verificar/scripts/verificar.mjs [tipos|lint|pruebas <ruta>|todo]   # controles con salida resumida
node .claude/skills/erp-mejoras/scripts/invariantes.mjs [--cambios]   # auditor estático de invariantes y deuda técnica
npm run db:generar -- --name <nombre>     # migración desde el esquema (revisar el SQL)
npx playwright test                       # recorridos e2e con ARCA simulado
```
CI (`.github/workflows/ci.yml`): typecheck → lint → test → build, y Playwright.

## Invariantes (romper una es un bug)
1. **Multiempresa por RLS**: datos de empresa solo dentro de `enLaEmpresa` / `conEmpresa` / `conApi`. `comoPlataforma`
   solo para tablas de plataforma. Nunca `db()` directo en código de app.
2. **Tabla con empresa**: `empresaId()` + `erp_aislar_por_empresa` en una migración `_seguridad`; FK compuestas
   `(empresa_id, id)`. `src/db/seguridad.test.ts` lo controla.
3. **Dinero**: `numeric` en la base, string en TS, `D`/`aImporte` de `src/lib/dinero.ts`. Nunca `number`.
4. **Fechas de negocio**: `hoyArgentina()` (`src/lib/fechas.ts`), nunca el día UTC.
5. **Comprobante emitido no se modifica**: NC/ND o anulación. Numeración con `siguienteNumero` (FOR UPDATE).
6. **Saldos** (cuentas corrientes, stock, fondos) se calculan desde movimientos; no se guardan.
7. **Auditoría, correos y webhooks** dentro de la misma transacción (`auditar`, `encolarCorreo`, `emitir`); el envío, después.
8. **Permisos**: acción → `enLaEmpresa('modulo.accion')`; página → `exigirPermiso`; sección → `exigirFuncion` en su layout.
9. **Migraciones**: generar → revisar → versionar. Nunca `drizzle-kit push`; nunca editar una ya commiteada.
10. **Servicios externos** (ARCA, pasarelas, tiendas) fuera de transacciones abiertas; rutas públicas excluidas en `src/proxy.ts`.

## Capas
`src/db/schema` (tablas) → `src/modulos/<area>` (reglas: `fn(tx, usuarioId, entrada: unknown) → { ok… }`, con
`*.test.ts` al lado) → `src/app/(app)/<ruta>/acciones.ts` (`'use server'`) → `page.tsx` + componentes `'use client'`.
`src/lib` = transversal (auth, permisos, planes, dinero, fechas, cuit, pdf, xlsx). UI: `src/components/ui.tsx`.

## Estilo
- Prettier: sin `;`, comillas simples, 130 columnas. Identificadores en español camelCase (`guardarArticulo`,
  `listarX`, `obtenerX`, `opcionesX`); componentes en PascalCase; acciones `xAccion` en `acciones.ts`.
- JSDoc en español que explica el porqué. Mensajes al usuario en rioplatense con voseo ("Revisá los campos marcados.").
- Commits en español, descriptivos, sin punto final. Cambio de comportamiento → actualizar el doc de `docs/`.

## Skills del proyecto (`.claude/skills/`) — cargá la que corresponda antes de trabajar
| Skill | Para |
|---|---|
| `erp-contexto` | Ubicar código y docs con poco contexto (mapa por área, scripts `mapa`/`tablas`/`funcion`) |
| `erp-esquema-migraciones` | Tablas, columnas, índices, RLS, migraciones |
| `erp-logica-dominio` | Reglas en `src/modulos` y pruebas Vitest |
| `erp-pantallas` | Páginas, acciones, formularios, descargas, UI, menú, permisos y planes (Next 16) |
| `erp-fiscal-arca` | Comprobantes, CAE, IVA, retenciones, IIBB, libro IVA |
| `erp-circuitos` | Ventas → cobranza, compras → pagos, tesorería, stock, asientos automáticos |
| `erp-integraciones` | API v1, webhooks, tiendas, pasarelas, WhatsApp/IA, correo, cron |
| `erp-seguridad` | Revisión multiempresa y checklist de seguridad |
| `erp-verificar` | Typecheck, lint, pruebas, e2e, commits y PRs |
| `erp-mejoras` | Auditor de invariantes, deuda conocida, criterios de arquitectura, mantener las skills al día |
| `erp-equipo` | Orquestar los subagentes: roles, flujos, paralelo vs secuencial, entregables compartidos |

## Equipo de subagentes (`.claude/agents/`)
`explorador-erp` (ubica, rápido) · `arquitecto-erp` (diseña y deja `plan.md`) · `fiscal-erp` (valida impuestos y
asientos) · `probador-erp` (pruebas y reproducción de bugs) · `implementador-erp` (construye una pieza y la verifica) ·
`revisor-erp` (revisa el diff) · `optimizador-erp` (detecta mejoras con evidencia) · `documentador-erp` (cierra el
ciclo en docs y skills). No se llaman entre sí: orquesta la sesión principal con la skill `erp-equipo`; se pasan el
trabajo por `.claude/trabajo/<tema>/` y terminan con un bloque `## Entrega` que dice qué sigue.

## Flujos de trabajo
- **Funcionalidad nueva**: `erp-contexto` (ubicar) → si cruza capas, equipo: explorador → arquitecto → (fiscal) →
  probador → implementador(es) → revisor → documentador. Si es chica: `erp-esquema-migraciones` → `erp-logica-dominio`
  → `erp-pantallas` → `erp-verificar`, en la sesión principal.
- **Bug**: reproducir con una prueba en `src/modulos/<area>/*.test.ts` → arreglar → `verificar.mjs pruebas <área>`.
- **Refactor u optimización**: `erp-mejoras` / `optimizador-erp` (evidencia y prioridad) → sin cambiar comportamiento
  → pruebas antes y después.
- **Antes de un PR**: `verificar.mjs todo` (incluye auditor de lo cambiado y skills al día) → `revisor-erp`.

## Al cerrar cada tarea
Lo no obvio que aprendiste del repo va a la skill o `CLAUDE.md` del área (1-3 líneas con el porqué); si una skill te
guió mal, se corrige en el mismo cambio; las preferencias del usuario van a memoria. Detalle en `erp-mejoras` §4.

## context-mode en este repo
- Explorar con `ctx_batch_execute` / `ctx_search` / scripts de `erp-contexto`; `Read` solo para lo que vas a editar.
- No abrir nunca: `drizzle/meta/*_snapshot.json` (~22.000 líneas c/u), `package-lock.json`, `.data/`, `.next/`.
- Pruebas, typecheck, lint y build siempre por `verificar.mjs` o `ctx_execute` con `intent`, no por Bash crudo.
- Docs del repo y de Next 16 (`node_modules/next/dist/docs/`): `ctx_index({ path })` y después `ctx_search`.

## Docs
`docs/01-arquitectura.md` (decisiones) · `02-modelo-de-datos.md` · `03-diseno.md` (UI) · `11-seguridad.md` · por área:
04 servicio técnico, 05 impuestos, 06 contabilidad, 07 producción, 08 tiendas, 09 sitio y SEO, 10 servidores, 12 CRM,
13 cobros online, 14 WhatsApp e IA. Despliegue: `deploy/LEEME.md`.
