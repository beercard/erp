import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Las pasarelas de pago, cada una traducida a lo mismo: armar un checkout
 * (un link para pagar un importe) y consultar si se pagó. El ERP nunca da un
 * pago por bueno por lo que dice un aviso: siempre lo confirma con la
 * pasarela usando las claves de la empresa (salvo GoCuotas, que no tiene
 * consulta pública: su aviso llega a una dirección secreta de cada pago).
 */

export type Proveedor = 'mercadopago' | 'payway' | 'gocuotas' | 'clover'

export const PROVEEDORES: Record<
  Proveedor,
  {
    nombre: string
    pagar: string
    medio: string
    campos: { clave: string; etiqueta: string; secreto?: boolean; ayuda?: string }[]
  }
> = {
  mercadopago: {
    nombre: 'Mercado Pago',
    pagar: 'Mercado Pago, tarjeta o dinero en cuenta',
    medio: 'mercado_pago',
    campos: [
      {
        clave: 'acceso',
        etiqueta: 'Access Token de producción',
        secreto: true,
        ayuda: 'Tus integraciones → Credenciales de producción.',
      },
      {
        clave: 'secreto',
        etiqueta: 'Clave secreta de las notificaciones (opcional)',
        secreto: true,
        ayuda: 'Webhooks → Clave secreta. Con ella se verifica la firma de cada aviso.',
      },
    ],
  },
  payway: {
    nombre: 'Payway',
    pagar: 'Tarjeta de crédito o débito (Payway)',
    medio: 'tarjeta_credito',
    campos: [
      { clave: 'site', etiqueta: 'Número de comercio (site)' },
      { clave: 'publica', etiqueta: 'Clave pública' },
      { clave: 'privada', etiqueta: 'Clave privada', secreto: true },
    ],
  },
  gocuotas: {
    nombre: 'GoCuotas',
    pagar: 'Cuotas sin interés con tarjeta de débito (GoCuotas)',
    medio: 'tarjeta_debito',
    campos: [
      { clave: 'email', etiqueta: 'Email del comercio en GoCuotas' },
      { clave: 'clave', etiqueta: 'Contraseña de la API', secreto: true },
    ],
  },
  clover: {
    nombre: 'Clover',
    pagar: 'Tarjeta (Clover)',
    medio: 'tarjeta_credito',
    campos: [
      { clave: 'comercio', etiqueta: 'Merchant ID' },
      { clave: 'token', etiqueta: 'Token privado de ecommerce', secreto: true },
      { clave: 'secreto', etiqueta: 'Signing secret de los webhooks', secreto: true },
    ],
  },
}

export type DatosCheckout = {
  /** Id del pago en el ERP: vuelve en los avisos y en las consultas. */
  referencia: string
  importe: number
  concepto: string
  comprador: { nombre: string; email: string | null; telefono: string | null }
  /** Adonde vuelve el comprador al terminar. */
  vuelta: string
  /** Adonde avisa la pasarela (dirección secreta del pago). */
  aviso: string
  vence: Date
}

export type Checkout = { externoId: string; url: string }

export type Consulta = {
  estado: 'aprobado' | 'rechazado' | 'pendiente'
  pagoExternoId?: string
  /** Importe cobrado, si la pasarela lo informa. */
  importe?: number
  detalle?: string
}

/** Lo que trajo el aviso (ya verificado o desde una dirección secreta). */
export type DatosAviso = { pagoId?: string; estado?: string }

export interface Pasarela {
  crear(d: DatosCheckout): Promise<Checkout>
  consultar(p: { externoId: string | null; referencia: string; aviso?: DatosAviso }): Promise<Consulta>
}

export type Fetch = typeof fetch

export class ErrorPasarela extends Error {
  constructor(
    mensaje: string,
    readonly estado?: number,
  ) {
    super(mensaje)
  }
}

async function pedir<T>(f: Fetch, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await f(url, { ...init, signal: AbortSignal.timeout(20_000), redirect: 'manual' })
  } catch (e) {
    throw new ErrorPasarela(`No se pudo conectar con la pasarela (${e instanceof Error ? e.message : 'sin respuesta'}).`)
  }
  const texto = (await r.text()).slice(0, 2_000_000)
  if (!r.ok) {
    let detalle = texto.slice(0, 300)
    try {
      const j = JSON.parse(texto) as { message?: string; error?: string | { message?: string }; description?: string }
      detalle = j.message ?? (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.description ?? detalle
    } catch {
      // No era JSON.
    }
    const que =
      r.status === 401 || r.status === 403
        ? 'La pasarela rechazó las claves.'
        : r.status === 404
          ? 'La pasarela no lo encontró.'
          : `La pasarela respondió ${r.status}.`
    throw new ErrorPasarela(`${que} ${detalle}`.trim(), r.status)
  }
  return (texto ? JSON.parse(texto) : null) as T
}

const dosDecimales = (n: number) => Math.round(n * 100) / 100
const centavos = (n: number) => Math.round(n * 100)
const iguales = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// ------------------------------------------------------------------ Mercado Pago

export type CredencialesMP = { acceso: string }

export function mercadoPago(f: Fetch, c: CredencialesMP): Pasarela {
  const h = { authorization: `Bearer ${c.acceso}`, 'content-type': 'application/json' }
  const API = 'https://api.mercadopago.com'
  type PagoMP = { id: number; status: string; status_detail?: string; external_reference?: string; transaction_amount?: number }
  const traducir = (p: PagoMP): Consulta => ({
    estado: ['approved', 'authorized'].includes(p.status)
      ? 'aprobado'
      : ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(p.status)
        ? 'rechazado'
        : 'pendiente',
    pagoExternoId: String(p.id),
    importe: p.transaction_amount,
    detalle: p.status_detail ?? p.status,
  })
  return {
    async crear(d) {
      const r = await pedir<{ id: string; init_point: string }>(f, `${API}/checkout/preferences`, {
        method: 'POST',
        headers: { ...h, 'x-idempotency-key': `${d.referencia}-${Date.now()}` },
        body: JSON.stringify({
          items: [
            {
              id: d.referencia,
              title: d.concepto.slice(0, 250),
              quantity: 1,
              unit_price: dosDecimales(d.importe),
              currency_id: 'ARS',
            },
          ],
          payer: { name: d.comprador.nombre, ...(d.comprador.email ? { email: d.comprador.email } : {}) },
          external_reference: d.referencia,
          notification_url: d.aviso,
          back_urls: { success: d.vuelta, failure: d.vuelta, pending: d.vuelta },
          auto_return: 'approved',
          expires: true,
          expiration_date_to: d.vence.toISOString(),
          statement_descriptor: undefined,
        }),
      })
      return { externoId: r.id, url: r.init_point }
    },
    async consultar({ referencia, aviso }) {
      if (aviso?.pagoId && /^\d+$/.test(aviso.pagoId)) {
        const p = await pedir<PagoMP>(f, `${API}/v1/payments/${aviso.pagoId}`, { headers: h })
        // Un aviso de otro pago (de la misma cuenta) no puede aprobar este.
        if (p.external_reference === referencia) return traducir(p)
      }
      const q = new URLSearchParams({ external_reference: referencia, sort: 'date_created', criteria: 'desc' })
      const r = await pedir<{ results: PagoMP[] }>(f, `${API}/v1/payments/search?${q}`, { headers: h })
      const pagos = (r.results ?? []).filter((p) => p.external_reference === referencia).map(traducir)
      return (
        pagos.find((p) => p.estado === 'aprobado') ??
        pagos.find((p) => p.estado === 'pendiente') ??
        pagos[0] ?? { estado: 'pendiente' }
      )
    },
  }
}

/**
 * Firma de los avisos de Mercado Pago: x-signature "ts=…,v1=…" con
 * HMAC-SHA256 (hex) de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function firmaMercadoPago(p: { firma: string | null; requestId: string | null; dataId: string | null; secreto: string }) {
  if (!p.firma) return false
  const partes = Object.fromEntries(p.firma.split(',').map((x) => x.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false
  const id = p.dataId && /[a-z]/i.test(p.dataId) ? p.dataId.toLowerCase() : p.dataId
  const manifiesto = `${id ? `id:${id};` : ''}${p.requestId ? `request-id:${p.requestId};` : ''}ts:${partes.ts};`
  return iguales(createHmac('sha256', p.secreto).update(manifiesto).digest('hex'), partes.v1)
}

// ------------------------------------------------------------------ Payway

export type CredencialesPayway = { site: string; publica: string; privada: string }

export function payway(f: Fetch, c: CredencialesPayway, prueba: boolean): Pasarela {
  const base = prueba ? 'https://developers.decidir.com' : 'https://ventasonline.payway.com.ar'
  const h = { apikey: c.privada, 'content-type': 'application/json', 'cache-control': 'no-cache' }
  return {
    async crear(d) {
      const r = await pedir<{ payment_link?: string; id?: string }>(f, `${base}/api/v1/checkout-payment-button/link`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          site: c.site,
          template_id: 1,
          total_price: dosDecimales(d.importe),
          currency: 'ARS',
          payment_method_id: 1,
          installments: [1],
          payment_description: `${d.concepto.slice(0, 80)} (${d.referencia.slice(0, 8)})`,
          public_apikey: c.publica,
          success_url: d.vuelta,
          cancel_url: d.vuelta,
          redirect_url: d.aviso,
        }),
      })
      if (!r.payment_link) throw new ErrorPasarela('Payway no devolvió el link de pago.')
      return { externoId: r.id ?? r.payment_link.split('/').pop()!, url: r.payment_link }
    },
    async consultar({ externoId, referencia, aviso }) {
      // Historial de los links de pago del comercio de los últimos días: se busca este link (o la referencia).
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 19)
      const hasta = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19)
      const q = new URLSearchParams({
        platform: 'SDK',
        site_id: c.site,
        from_date: desde,
        to_date: hasta,
        page: '1',
        items_per_page: '100',
      })
      const r = await pedir<
        { data?: Record<string, unknown>[]; results?: Record<string, unknown>[] } | Record<string, unknown>[]
      >(f, `${base}/api/v1/checkout-payment-button/get-history?${q}`, { headers: h })
      const lista = Array.isArray(r) ? r : (r.data ?? r.results ?? [])
      const corta = referencia.slice(0, 8)
      const fila = lista.find((x) => {
        const t = JSON.stringify(x)
        return (externoId && t.includes(externoId)) || t.includes(`(${corta})`)
      })
      const estado = String(fila?.status ?? fila?.status_description ?? aviso?.estado ?? '').toLowerCase()
      return {
        estado: /aprob|approved|acredit/.test(estado)
          ? 'aprobado'
          : /rechaz|rejected|anulad|vencid/.test(estado)
            ? 'rechazado'
            : 'pendiente',
        pagoExternoId: fila ? String(fila.payment_id ?? fila.transaction_id ?? fila.id ?? '') || undefined : undefined,
        importe: fila && typeof fila.amount === 'number' ? fila.amount : undefined,
        detalle: estado || undefined,
      }
    },
  }
}

// ------------------------------------------------------------------ GoCuotas

export type CredencialesGoCuotas = { email: string; clave: string }

export function goCuotas(f: Fetch, c: CredencialesGoCuotas, prueba: boolean): Pasarela {
  const base = prueba ? 'https://sandbox.gocuotas.com' : 'https://www.gocuotas.com'
  async function token() {
    const q = new URLSearchParams({ email: c.email, password: c.clave })
    const r = await pedir<{ token?: string }>(f, `${base}/api_redirect/v1/authentication?${q}`, { method: 'POST' })
    if (!r.token) throw new ErrorPasarela('GoCuotas rechazó el email o la contraseña.', 401)
    return r.token
  }
  return {
    async crear(d) {
      const t = await token()
      const r = await pedir<{ url_init?: string; id?: number | string }>(f, `${base}/api_redirect/v1/checkouts`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount_in_cents: centavos(d.importe),
          order_reference_id: d.referencia,
          url_success: d.vuelta,
          url_failure: d.vuelta,
          webhook_url: d.aviso,
          ...(d.comprador.email ? { email: d.comprador.email } : {}),
          ...(d.comprador.telefono ? { phone_number: d.comprador.telefono.replace(/\D/g, '') } : {}),
        }),
      })
      if (!r.url_init) throw new ErrorPasarela('GoCuotas no devolvió el link de pago.')
      return { externoId: String(r.id ?? d.referencia), url: r.url_init }
    },
    async consultar({ aviso }) {
      // GoCuotas no publica una consulta de estado: vale su aviso, que llega a la dirección secreta de este pago.
      const estado = (aviso?.estado ?? '').toLowerCase()
      return {
        estado:
          estado === 'approved'
            ? 'aprobado'
            : ['denied', 'cancelled', 'rejected', 'undefined'].includes(estado)
              ? 'rechazado'
              : 'pendiente',
        detalle: estado || undefined,
      }
    },
  }
}

// ------------------------------------------------------------------ Clover

export type CredencialesClover = { comercio: string; token: string }

export function clover(f: Fetch, c: CredencialesClover, prueba: boolean): Pasarela {
  const base = prueba ? 'https://apisandbox.dev.clover.com' : process.env.CLOVER_API_URL || 'https://api.clover.com'
  const h = { authorization: `Bearer ${c.token}`, 'x-clover-merchant-id': c.comercio, 'content-type': 'application/json' }
  return {
    async crear(d) {
      const [nombre, ...apellido] = d.comprador.nombre.split(' ')
      const r = await pedir<{ href?: string; checkoutSessionId?: string }>(f, `${base}/invoicingcheckoutservice/v1/checkouts`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          customer: {
            firstName: nombre,
            lastName: apellido.join(' ') || undefined,
            ...(d.comprador.email ? { email: d.comprador.email } : {}),
            ...(d.comprador.telefono ? { phoneNumber: d.comprador.telefono } : {}),
          },
          shoppingCart: {
            lineItems: [{ name: d.concepto.slice(0, 120), price: centavos(d.importe), unitQty: 1, note: d.referencia }],
          },
          redirectUrls: { success: d.vuelta, failure: d.vuelta, cancel: d.vuelta },
        }),
      })
      if (!r.href || !r.checkoutSessionId) throw new ErrorPasarela('Clover no devolvió el link de pago.')
      return { externoId: r.checkoutSessionId, url: r.href }
    },
    async consultar({ aviso }) {
      if (!aviso?.pagoId) return { estado: 'pendiente' }
      const p = await pedir<{ id: string; result?: string; amount?: number }>(
        f,
        `${base}/v3/merchants/${encodeURIComponent(c.comercio)}/payments/${encodeURIComponent(aviso.pagoId)}`,
        { headers: h },
      )
      return {
        estado: p.result === 'SUCCESS' ? 'aprobado' : p.result ? 'rechazado' : 'pendiente',
        pagoExternoId: p.id,
        importe: typeof p.amount === 'number' ? p.amount / 100 : undefined,
        detalle: p.result,
      }
    },
  }
}

/** Firma de los avisos de Clover: Clover-Signature "t=…,v1=…" con HMAC-SHA256 (hex) de "<t>.<cuerpo>". */
export function firmaClover(firma: string | null, cuerpo: string, secreto: string) {
  if (!firma) return false
  const partes = Object.fromEntries(firma.split(',').map((x) => x.trim().split('=') as [string, string]))
  if (!partes.t || !partes.v1) return false
  return iguales(createHmac('sha256', secreto).update(`${partes.t}.${cuerpo}`).digest('hex'), partes.v1)
}

export function pasarela(f: Fetch, proveedor: Proveedor, credenciales: unknown, prueba: boolean): Pasarela {
  switch (proveedor) {
    case 'mercadopago':
      return mercadoPago(f, credenciales as CredencialesMP)
    case 'payway':
      return payway(f, credenciales as CredencialesPayway, prueba)
    case 'gocuotas':
      return goCuotas(f, credenciales as CredencialesGoCuotas, prueba)
    case 'clover':
      return clover(f, credenciales as CredencialesClover, prueba)
  }
}
