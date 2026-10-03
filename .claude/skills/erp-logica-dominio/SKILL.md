---
name: erp-logica-dominio
description: Cómo escribir y probar la lógica de negocio del ERP en src/modulos — funciones que reciben la transacción de la empresa, validan la entrada con Zod 4, auditan en la misma transacción y devuelven resultados tipados {ok…} — y sus pruebas Vitest sobre PGlite. Usala cuando agregues o cambies cualquier regla de negocio (altas, modificaciones, anulaciones, cálculos, importaciones, procesos de la tarea programada), cuando escribas o arregles un *.test.ts, o cuando dudes si algo va en el módulo, en la acción del servidor o en la página.
---

# Lógica de dominio (`src/modulos`) y sus pruebas

## La capa y por qué existe
`src/modulos/<area>/*.ts` es donde viven **todas** las reglas. Las acciones del servidor y las páginas solo
traducen HTTP ↔ dominio. Así la regla se prueba sin Next, se reusa desde la API v1, la tarea programada, el
agente de WhatsApp o un script de importación, y siempre corre bajo RLS.

Contrato de una función de módulo:

```ts
export async function guardarVale(
  tx: Transaccion,              // SIEMPRE primero: la transacción de conEmpresa/enLaEmpresa (RLS ya activo)
  usuarioId: string | null,     // para auditar; null = lo hizo el sistema (cron, aviso de una tienda)
  entrada: unknown,             // lo crudo del formulario/API: se valida acá, no en la acción
  id?: string,                  // presente = modificación
): Promise<{ ok: true; id: string } | { ok: false; errores: Partial<Record<keyof DatosVale, string>>; mensaje?: string }>
```

- **No** importa nada de `next/*`, ni lee cookies/sesión, ni llama a `db()`: recibe `tx`.
- **No** filtra por `empresa_id`: RLS lo hace (y `empresa_id` se completa solo en los altas). La excepción son las
  tablas de plataforma sin RLS (usuarios, roles, membresías…): ahí sí se filtra a mano (`empresa/usuarios.ts`).
- Errores esperables (validación, "ya no existe", período cerrado) se **devuelven**; solo se lanza lo inesperado.
- Nombres: `listarX`, `obtenerX`, `guardarX` (alta+modificación), `emitirX`, `anularX`, `opcionesX` (combos de un form).
- JSDoc en español con el porqué; mensajes al usuario con voseo ("Escribí el código.", "Ese artículo ya no existe.").

## Plantilla (basada en `maestros/articulo.ts`)

```ts
import { eq } from 'drizzle-orm'
import * as z from 'zod'

import type { Transaccion } from '../../db/conexion'
import { vales } from '../../db/schema'
import { auditar } from '../../lib/auditoria'
import { normalizarNumero } from '../../lib/dinero'
import { mensajeDeBase } from '../../lib/errores'
import { controlarBloqueo } from '../empresa/bloqueos'

const importe = z.string().trim().transform((v) => normalizarNumero(v))   // "1.234,50" → "1234.50"
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, { error: 'Escribí un importe válido.' }))

export const EsquemaVale = z.object({
  numero: z.coerce.number().int().positive({ error: 'El número tiene que ser positivo.' }),
  fecha: z.iso.date({ error: 'Elegí la fecha.' }),
  importe,
  terceroId: z.string().transform((v) => v || null).pipe(z.uuid().nullable()).optional(),
})
export type DatosVale = z.infer<typeof EsquemaVale>

export async function guardarVale(tx: Transaccion, usuarioId: string | null, entrada: unknown, id?: string) {
  const p = EsquemaVale.safeParse(entrada)
  if (!p.success) {
    const errores: Partial<Record<keyof DatosVale, string>> = {}
    for (const i of p.error.issues) errores[i.path[0] as keyof DatosVale] ??= i.message
    return { ok: false as const, errores }
  }
  const cerrado = await controlarBloqueo(tx, 'tesoreria', p.data.fecha)
  if (cerrado) return { ok: false as const, errores: { fecha: cerrado } }
  try {
    // Punto de guardado: si falla, se deshace solo esto y la transacción de afuera sigue sana.
    return await tx.transaction(async (tx) => {
      if (id) {
        const [antes] = await tx.select().from(vales).where(eq(vales.id, id))
        if (!antes) return { ok: false as const, errores: {}, mensaje: 'Ese vale ya no existe.' }
        const [despues] = await tx.update(vales).set(p.data).where(eq(vales.id, id)).returning()
        await auditar(tx, { usuarioId, accion: 'modificacion', entidad: 'vale', entidadId: id, antes, despues })
        return { ok: true as const, id }
      }
      const [nuevo] = await tx.insert(vales).values(p.data).returning()
      await auditar(tx, { usuarioId, accion: 'alta', entidad: 'vale', entidadId: nuevo.id, despues: nuevo })
      return { ok: true as const, id: nuevo.id }
    })
  } catch (e) {
    if (mensajeDeBase(e).includes('vales_empresa_id_numero')) return { ok: false as const, errores: { numero: 'Ese número ya existe.' } }
    throw e
  }
}
```

Zod 4: mensajes con `{ error: '...' }` (no `message`), `z.iso.date()`, `z.uuid()`, `z.coerce`. Para formularios
comerciales ya existen `decimal` y `primerError` en `comercial/documentos.ts`: reusalos.

## Piezas transversales (usalas, no las reinventes)

| Necesidad | Usá | Por qué |
|---|---|---|
| Dinero | `D`, `monto`, `aImporte`, `sumar`, `aplicarPorcentaje` (`lib/dinero.ts`) | numeric llega como string; `number` pierde centavos. Redondeo half-up; IVA de ARCA half-even con `aImporteArca`. |
| Importe en pesos de un comprobante | `enPesos` (`facturacion/cuentas.ts`) | total × cotización con el mismo redondeo que el SQL. |
| "Hoy" y fechas de negocio | `hoyArgentina()`, `sumarDias`, `fechaCorta` (`lib/fechas.ts`) | El servidor está en UTC: después de las 21 h "hoy" sería mañana. Recibí `hoy` como parámetro opcional para poder probar. |
| Número correlativo | `siguienteNumero(tx, tipo, puntoVenta)` (`comercial/numeracion.ts`) | `SELECT … FOR UPDATE` sobre el numerador; nunca `max()+1`. |
| Período cerrado | `controlarBloqueo(tx, 'ventas' \| 'compras' \| 'tesoreria', fecha)` | Antes de cargar, modificar o anular algo fechado. IVA presentado: `controlarPeriodoIva`. |
| Límite del plan | `controlarLimite(empresaId, 'comprobantesMes' \| …, hoy)` (`plataforma/suscripciones.ts`) | CAE, usuarios, puntos de venta. |
| Auditoría | `auditar(tx, { usuarioId, accion, entidad, entidadId, antes, despues })` | Misma transacción: si se revierte, no queda registro huérfano. `accion`: alta, modificacion, baja, emision, anulacion, ingreso, importacion. |
| Correo | `encolarCorreo(tx, {...})` y después `after(() => enviarPendientes(empresaId))` en la acción | Si la operación se revierte, no sale ningún aviso. |
| Webhook | `emitir(tx, evento, datos)` (`integraciones/webhooks.ts`) | Igual: se encola y se entrega fuera. |
| Error de Postgres | `mensajeDeBase(e)` (`lib/errores.ts`) | Drizzle envuelve distinto con PGlite y postgres-js. |
| CUIT | `validarCuit`, `formatearCuit` (`lib/cuit.ts`) | Dígito verificador. |

## Reglas de diseño
- **Nada se borra si tiene valor fiscal o contable**: se anula (`estado: 'anulado'`) y se revierten sus efectos
  (stock, imputaciones, asiento). Un comprobante autorizado ni siquiera se puede tocar desde la base (trigger).
- **Saldos = suma de movimientos.** No agregues columnas de saldo; si hiciera falta por rendimiento, recalculala en la
  misma transacción y agregá una prueba que compare (docs/01 §6).
- **Servicios externos fuera de la transacción.** No llames HTTP (ARCA, Mercado Pago, tiendas) teniendo filas
  bloqueadas. Patrón de `emitirComprobante`: tx 1 reserva y deja `pendiente_verificacion` → llamada externa sin tx →
  tx 2 guarda el resultado; si la respuesta es incierta, queda pendiente para verificar. Inyectá el cliente externo
  como parámetro (`crearCliente`) para poder reemplazarlo en las pruebas.
- **Cálculo puro aparte.** Lo que no necesita base (`comercial/calculo.ts`, `compras/ganancias.ts`,
  `contratos/calculo.ts`, `servicio/jornadaDia.ts`) va en archivos sin imports de servidor: se prueba unitario y lo
  pueden importar componentes `'use client'`. Lo mismo para textos/catálogos compartidos (`tipos.ts`, `medios.ts`).
- **Idempotencia** en procesos de la tarea programada e importaciones: correrlos dos veces no duplica (índices únicos +
  `onConflictDoNothing/Update`, o `not exists`).
- **Dos empresas a la vez nunca**: una función trabaja con la `tx` que recibe. Para recorrer empresas (cron), el
  llamador abre un `conEmpresa(e.id, …)` por empresa.

## Pruebas (Vitest + PGlite)

Al lado del módulo: `src/modulos/<area>/<archivo>.test.ts`. Todo cálculo fiscal o de dinero lleva prueba
(docs/01 §1). Plantilla (de `maestros/articulo.test.ts`):

```ts
import { beforeAll, describe, expect, it } from 'vitest'

import { conEmpresa } from '../../db/empresa'
import { baseDePrueba } from '../../db/pruebas'
import { empresas } from '../../db/schema'
import { guardarVale } from './vales'

let empresa: string
const USUARIO = '00000000-0000-4000-8000-000000000001'
const en = <T>(f: Parameters<typeof conEmpresa<T>>[1]) => conEmpresa(empresa, f)

beforeAll(async () => {
  const db = await baseDePrueba() // base nueva con TODAS las migraciones, una por archivo
  const [e] = await db.insert(empresas).values({ razonSocial: 'Prueba S.A.', cuit: '30111111118', condicionIva: 1 }).returning()
  empresa = e.id // las empresas las da de alta la plataforma (dueño, sin RLS)
})

describe('vales', () => {
  it('valida y no deja repetir el número', async () => {
    expect(await en((tx) => guardarVale(tx, USUARIO, { numero: '1', fecha: '2026-10-01', importe: '-5' })))
      .toMatchObject({ ok: false, errores: { importe: expect.any(String) } })
    const ok = await en((tx) => guardarVale(tx, USUARIO, { numero: '1', fecha: '2026-10-01', importe: '1.234,50' }))
    expect(ok.ok).toBe(true)
  })
})
```

- Montos se comparan como **strings** con sus decimales (`'1320.55'`), no como números.
- Fechas fijas (`const HOY = '2026-10-01'`) y pasá `hoy` a la función; no dependas del reloj.
- Servicios externos: clase falsa que implementa el tipo (`ArcaFalso implements ClienteArca` en
  `facturacion/facturacion.test.ts`) o transporte reemplazable (`arca/soap.ts`, `tiendas/http.ts`). Nunca red real.
- Aislamiento: si la función toca algo sensible, sumá un caso con dos empresas (ver `src/db/seguridad.test.ts`).
- Correr solo lo tuyo: `node .claude/skills/erp-verificar/scripts/verificar.mjs pruebas src/modulos/<area>`.
- Cada archivo levanta un Postgres WASM (unos segundos); `maxWorkers: 4` evita quedarse sin memoria en Windows.
- Con `PRUEBAS_POSTGRES=<url>` las mismas pruebas corren contra Postgres real.

## Checklist
- [ ] Función en `src/modulos/<area>` con `tx` primero, entrada `unknown` validada con Zod, resultado tipado
- [ ] Sin `next/*`, sin `db()`, sin filtros manuales por empresa (salvo tablas de plataforma)
- [ ] `auditar` en la misma transacción; bloqueos/límites controlados; dinero con `D`/`aImporte`; fechas con `hoyArgentina`
- [ ] Nada externo dentro de la transacción; correos/webhooks encolados
- [ ] Prueba al lado, con casos de error y de dinero exacto; pasa con `verificar.mjs pruebas <ruta>`
