# src/app — rutas de Next.js 16

Detalle y plantillas: skill `erp-pantallas` (rutas de `api/`: skill `erp-integraciones`).

- `params` y `searchParams` son Promises: `await`. Tipos globales `PageProps<'/ruta'>`, `LayoutProps<'/'>`, `RouteContext<'/ruta'>` (los genera `npm run typecheck`; la ruta va sin el grupo `(app)`).
- `src/proxy.ts` reemplaza a middleware y solo mira la cookie: toda ruta pública nueva va en la exclusión de su `matcher`.
- Páginas: leer con `enLaEmpresa('modulo.ver', tx => …)`; `exigirPermiso` para explicar qué falta; `notFound()` si el id no es válido o no existe.
- Acciones (`acciones.ts`, `'use server'`): `enLaEmpresa(permiso, (tx, s) => moduloFn(tx, s.usuario.id, …))`, capturar `SinPermiso`, `revalidatePath`, y `redirect` fuera del `try` (lanza).
- La lógica va en `src/modulos`, no en la acción ni en la página.
- Formularios cliente con `useActionState`; un componente `'use client'` nunca importa `@/db` ni `@/lib/auth/servidor`.
- UI con `@/components/ui` y tokens de color (`bg-superficie`, `text-texto-2`…); números con la clase `cifras`; textos con voseo.
- Pantalla nueva: permiso en `src/lib/permisos.ts`, función del plan en `src/lib/planes.ts` si corresponde, ítem en `src/components/shell/menu.ts`.
- Antes de usar una API de Next que no esté ya en el repo, buscala en `node_modules/next/dist/docs/` (con `ctx_index` + `ctx_search`).
