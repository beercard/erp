import { randomBytes } from 'node:crypto'

import { direccionPermitida } from '@/modulos/integraciones/webhooks'
import { leerFlujo } from '@/modulos/tiendas/flujo'
import { registrarAvisos } from '@/modulos/tiendas/woocommerce'

import { base, darDeAlta } from '../../_lib/comun'

/**
 * WooCommerce manda acá, servidor a servidor, las claves que generó la tienda
 * al aprobar la conexión. No hay sesión: lo que autoriza es el state firmado
 * (user_id), que dice qué empresa y qué tienda pidieron conectar.
 */
export async function POST(request: Request) {
  const d = (await request.json().catch(() => null)) as {
    user_id?: string
    consumer_key?: string
    consumer_secret?: string
    key_permissions?: string
  } | null
  const flujo = leerFlujo(d?.user_id)
  if (!flujo || flujo.tipo !== 'woocommerce' || !flujo.tienda) return new Response('Pedido vencido.', { status: 400 })
  if (!d?.consumer_key || !d.consumer_secret) return new Response('Faltan las claves.', { status: 400 })
  if (d.key_permissions && d.key_permissions !== 'read_write') {
    return new Response('Hace falta permiso de lectura y escritura.', { status: 400 })
  }
  if (await direccionPermitida(flujo.tienda)) return new Response('Dirección no permitida.', { status: 400 })
  const credenciales = { url: flujo.tienda, clave: d.consumer_key, secreto: d.consumer_secret }
  const secretoAvisos = randomBytes(24).toString('base64url')
  const r = await darDeAlta(
    { empresaId: flujo.empresaId, usuarioId: flujo.usuarioId },
    {
      tipo: 'woocommerce',
      nombre: `WooCommerce · ${new URL(flujo.tienda).host}`,
      cuenta: flujo.tienda,
      credenciales,
      secretoAvisos,
    },
    (canalId) => registrarAvisos(fetch, credenciales, `${base()}/api/tiendas/woocommerce/avisos/${canalId}`, secretoAvisos),
  )
  return r.ok ? Response.json({ ok: true }) : new Response(r.error, { status: 409 })
}
