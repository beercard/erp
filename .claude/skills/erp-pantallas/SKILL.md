---
name: erp-pantallas
description: Cómo construir pantallas del ERP con Next.js 16 (App Router) — páginas server, acciones del servidor ('use server'), formularios cliente con useActionState, descargas PDF/Excel por route handlers, el kit de UI (src/components/ui.tsx) y los tokens de diseño, el menú, los permisos y las funciones del plan. Usala para cualquier pantalla, listado, ficha, formulario, botón de acción, descarga o ajuste visual en src/app o src/components, y antes de usar una API de Next que no veas ya en el repo: esta versión (16.3) cambió APIs respecto de lo que conocés.
---

# Pantallas, acciones y UI

## Next.js 16 en este repo (lo que difiere de lo que sabés)
- `params` y `searchParams` son **Promises**: siempre `await`. El acceso sincrónico ya no existe.
- Tipos globales generados por `next typegen` (corre dentro de `npm run typecheck`): `PageProps<'/articulos/[id]'>`,
  `LayoutProps<'/'>`, `RouteContext<'/cobranzas/caja/[id]/pdf'>`. La ruta va **sin** el grupo `(app)`.
- `middleware` ahora es **`src/proxy.ts`** (`export function proxy`, runtime Node). Solo chequea que exista la cookie
  `erp_sesion`; la verificación real la hace cada página/acción. **Toda ruta pública nueva** (webhook, enlace sin
  sesión, página del sitio) hay que agregarla a la exclusión del `matcher`, o redirige a `/ingresar`.
- Después de mutar: `revalidatePath(ruta)`. `refresh()` de `next/cache` refresca el router desde una acción;
  `revalidateTag` ahora pide un segundo argumento (perfil) y `updateTag` existe solo en acciones. El repo hoy no usa
  `'use cache'` ni tags: no los introduzcas sin necesidad.
- `after(() => …)` de `next/server` para trabajo después de responder (mandar correos encolados).
- `redirect()` **lanza**: llamalo fuera de `try/catch` (o volvé a lanzar). En acciones usa `push` por defecto.
- No hay `loading.tsx`/`error.tsx` en el repo. Si necesitás un límite de error por componente existe `catchError` de `next/error`.
- Cada acción del servidor es un endpoint POST público: validá permiso y entrada **adentro** de la acción (lo hace `enLaEmpresa`).
- Dudas de API: `ctx_search` sobre `node_modules/next/dist/docs/` (indexá con `ctx_index({ path })` el archivo del tema).

## Dónde va cada cosa
```
src/app/(app)/<ruta>/page.tsx          página server (lee con enLaEmpresa('x.ver'))
src/app/(app)/<ruta>/acciones.ts       'use server' — xAccion(...) → módulo de dominio
src/app/(app)/<ruta>/Formulario*.tsx   'use client' — useActionState
src/app/(app)/<ruta>/Piezas.tsx        otros componentes cliente de la ruta
src/app/(app)/<ruta>/[id]/pdf/route.ts descargas (GET con RouteContext)
src/app/(app)/<seccion>/layout.tsx     exigirFuncion('<funcion>') si la sección depende del plan
```
Grupos: `(app)` = sistema con sesión (su layout arma menú y barra); `(sitio)` = sitio comercial público;
`portal/` = clientes finales; `plataforma/` = consola de Vektra; `api/` = rutas sin UI.
Toda regla de negocio va en `src/modulos` (skill `erp-logica-dominio`); la página y la acción solo traducen.

## Página de listado (de `articulos/page.tsx`)
```tsx
import type { Metadata } from 'next'
import { BotonEnlace, EncabezadoPagina, Panel } from '@/components/ui'
import { enLaEmpresa } from '@/lib/auth/servidor'
import { listarVales } from '@/modulos/tesoreria/vales'

export const metadata: Metadata = { title: 'Vales a rendir' }

export default async function PaginaVales({ searchParams }: PageProps<'/tesoreria/vales'>) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const filas = await enLaEmpresa('tesoreria.ver', (tx) => listarVales(tx, { q }))
  return (
    <>
      <EncabezadoPagina titulo="Vales a rendir" bajada={`${filas.length.toLocaleString('es-AR')} vales`}
        acciones={<BotonEnlace href="/tesoreria/vales/nuevo" variante="primario">Nuevo</BotonEnlace>} />
      <form role="search" className="mb-3">{/* input name="q" — la lupa la pone globals.css */}</form>
      <Panel className="overflow-x-auto"><table className="w-full text-sm">{/* … */}</table></Panel>
    </>
  )
}
```
- `enLaEmpresa(permiso, tx => …)` lee bajo RLS y, sin permiso, lanza `SinPermiso`. Para que la página muestre
  "te falta tal permiso/plan" en vez de un error, empezá con `await exigirPermiso('x.y')` (redirige con explicación).
- Ficha `[id]`: validá el formato (`/^[0-9a-f-]{36}$/i`) y `notFound()` si no existe. Para modo lectura:
  `const sesion = await requerirEmpresa(); const puedeEditar = tienePermiso(sesion.permisos, 'x.editar')` y pasá
  `soloLectura` al formulario.
- Lista vacía: `<Vacio titulo="…">qué es y cómo empezar</Vacio>` o la fila "Todavía no hay …".

## Acción del servidor (de `articulos/acciones.ts`)
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { guardarVale } from '@/modulos/tesoreria/vales'

export type EstadoVale = { errores?: Record<string, string>; mensaje?: string; valores?: Record<string, string> } | undefined

export async function guardarValeAccion(id: string | null, _: EstadoVale, formData: FormData): Promise<EstadoVale> {
  const valores = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
  let r
  try {
    r = await enLaEmpresa('tesoreria.mover', (tx, s) => guardarVale(tx, s.usuario.id, valores, id ?? undefined))
  } catch (e) {
    if (e instanceof SinPermiso) return { mensaje: e.message, valores }
    throw e
  }
  if (!r.ok) return { errores: r.errores as Record<string, string>, mensaje: r.mensaje ?? 'Revisá los campos marcados.', valores }
  revalidatePath('/tesoreria/vales')
  redirect(`/tesoreria/vales/${r.id}?guardado=1`) // fuera del try: redirect lanza
}
```
- Devolvé `valores` para repoblar el formulario (los inputs son no controlados).
- Checkbox: `formData.has('campo')`. Números: mandalos como string y que el módulo normalice (`normalizarNumero`).
- Correos encolados por el módulo: `after(() => enviarPendientes(empresaId).catch(() => undefined))`.
- Acciones simples sin estado (borrar, quitar): `async function xAccion(id: string) { await enLaEmpresa(...); revalidatePath(...) }`
  y en el cliente `<form action={xAccion.bind(null, id)}>` con `BotonConfirmar` si no tiene vuelta atrás.

## Formulario cliente (de `articulos/FormularioArticulo.tsx`)
```tsx
'use client'
import { useActionState, useRef } from 'react'
import { Aviso, Boton, Campo, Panel, Selector } from '@/components/ui'
import { guardarValeAccion } from './acciones'

export function FormularioVale({ id, inicial, soloLectura = false }: { id: string | null; inicial: Record<string, string | null>; soloLectura?: boolean }) {
  const [estado, accion, enviando] = useActionState(guardarValeAccion.bind(null, id), undefined)
  const formulario = useRef<HTMLFormElement>(null)
  const v = (c: string) => estado?.valores?.[c] ?? inicial[c] ?? ''
  const e = estado?.errores ?? {}
  return (
    <form ref={formulario} action={accion} noValidate className="flex flex-col gap-4"
      onKeyDown={(ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); formulario.current?.requestSubmit() } }}>
      {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      <fieldset disabled={soloLectura} className="contents">
        <Panel>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="importe" name="importe" etiqueta="Importe" defaultValue={v('importe')} error={e.importe} inputMode="decimal" className="cifras" />
          </div>
        </Panel>
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Grabando…' : 'Grabar'}</Boton>
      </fieldset>
    </form>
  )
}
```
Un componente `'use client'` nunca importa `@/db`, `@/lib/auth/servidor` ni módulos con base; sí puede importar
archivos puros (`modulos/*/tipos.ts`, `medios.ts`, `comercial/calculo.ts`, `lib/dinero.ts`, `lib/fechas.ts`).

## Descarga PDF/Excel (de `cobranzas/caja/[id]/pdf/route.ts`)
```ts
export async function GET(_: Request, { params }: RouteContext<'/cobranzas/caja/[id]/pdf'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })
  const r = await enLaEmpresa('ventas.ver', (tx) => datosReporte(tx, id))
  if (!r) return new Response(null, { status: 404 })
  return new Response(Buffer.from(pdfCierre(r.cierre, r.empresa)), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="cierre-${id.slice(0, 8)}.pdf"`, 'cache-control': 'private, no-store' },
  })
}
```
Generadores propios sin dependencias: `lib/pdf.ts`, `lib/xlsx.ts`, `lib/csv.ts`, `lib/zip.ts`.

## Permisos, plan y menú (tres lugares)
1. **Permiso** nuevo `modulo.accion` → `MODULOS_PERMISOS` en `src/lib/permisos.ts` (con descripción para el editor de roles).
   Comodines válidos en roles: `*`, `ventas.*`, `*.ver`. Las lecturas terminan en `.ver` (siguen vivas en solo lectura).
2. **Plan**: si el permiso pertenece a una función paga, mapealo en `FUNCION_DE_PERMISO` (`src/lib/planes.ts`).
   Funciones: facturacion, comercial, stock, compras, tesoreria, informes, roles, api, contratos, servicio, tienda.
   Sección entera dependiente del plan → `layout.tsx` con `await exigirFuncion('<funcion>')`.
3. **Menú**: ítem en `SECCIONES` de `src/components/shell/menu.ts` con `permiso` (si falta, no se muestra) y
   `funcion` (si el plan no la incluye, aparece con candado solo para quien administra la suscripción). Ícono de lucide.

Permisos efectivos = rol ∩ plan, calculados al leer la sesión: `enLaEmpresa` y `tienePermiso` no saben de planes.

## UI: kit y tokens (docs/03-diseno.md)
- Componentes de `@/components/ui`: `Boton`/`BotonEnlace` (`variante`: primario —uno por pantalla—, secundario,
  fantasma, peligro), `Campo`, `Selector` (`opciones`, `vacio`), `Chip` (`tono`: neutro, acento, ok, aviso, error, info),
  `Panel`, `EncabezadoPagina` (`titulo`, `bajada`, `acciones`), `Aviso` (`tono`, error por defecto), `Vacio`, `Tecla`.
  Más: `BotonConfirmar` (pide confirmación), `components/comercial/*` (editor y vista de documentos con renglones).
- **Solo tokens**: `bg-superficie`, `bg-superficie-2`, `text-texto-2`, `text-texto-3`, `border-borde`, `border-borde-fuerte`,
  `bg-acento`, `text-acento`, `bg-ok-suave`, `shadow-suave`, `bg-app-<area>/14`… Un color suelto (`bg-blue-500`, `#fff`)
  rompe el tema oscuro.
- Importes, CUIT, números de comprobante y códigos: clase `cifras` (cifras tabulares) y alineados a la derecha en tablas.
  Formato: `formatearMonto(valor, simbolo)`, `fechaCorta(iso)`, `toLocaleString('es-AR')`.
- Tablas dentro de `main.contenido` toman solas el encabezado y el hover; buscadores con `form[role=search]`.
- Íconos lucide con `aria-hidden` y `className="size-4"`; todo campo con `<label>` (lo hace `Campo`).
- Textos en español rioplatense, voseo, cortos y accionables. Nada de "Error 500": decí qué pasó y qué hacer.

## Checklist
- [ ] Página con `PageProps<'/ruta'>`, `await` de params/searchParams, `metadata.title`, permiso de lectura
- [ ] Acción con `enLaEmpresa(permiso)`, `SinPermiso` capturado, `revalidatePath`, `redirect` fuera del try
- [ ] Lógica en `src/modulos` (no en la acción ni en la página)
- [ ] Permiso en `permisos.ts`, función en `planes.ts` si corresponde, ítem en `menu.ts`, `layout.tsx` con `exigirFuncion`
- [ ] Ruta pública → excluida en `src/proxy.ts`
- [ ] Solo tokens de color; `cifras` en números; textos con voseo
- [ ] `npm run typecheck` (regenera tipos de rutas) y probar en el navegador (skill `run`, puerto 3100 en `.claude/launch.json`)
