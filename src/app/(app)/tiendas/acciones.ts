'use server'

import { sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { articulos } from '@/db/schema'
import { enLaEmpresa, requerirEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { tienePermiso } from '@/lib/permisos'
import { direccionPermitida } from '@/modulos/integraciones/webhooks'
import { conectarCanal, configurarCanal, desconectarCanal, vincularPublicacion } from '@/modulos/tiendas/canales'
import { crearFlujo } from '@/modulos/tiendas/flujo'
import { ErrorCanal } from '@/modulos/tiendas/http'
import { sincronizarCanal, traerPublicaciones } from '@/modulos/tiendas/sincronizar'
import { probarMagento } from '@/modulos/tiendas/magento'
import { probarPrestashop } from '@/modulos/tiendas/prestashop'
import { normalizarTiendaShopify, shopifyConfigurado, urlAutorizacionShopify } from '@/modulos/tiendas/shopify'
import { normalizarTienda, urlAutorizacion } from '@/modulos/tiendas/woocommerce'

export type Estado = { error?: string; ok?: string } | undefined

const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

async function intentar<T extends { ok: boolean; error?: string }>(f: () => Promise<T>) {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message }
    throw e
  }
}

/** WooCommerce: se valida la dirección y se manda al panel de la tienda a aprobar las claves. */
export async function conectarWooAccion(_: Estado, fd: FormData): Promise<Estado> {
  const s = await quienConecta()
  if (!s) return { error: 'No tenés permiso para conectar tiendas.' }
  const tienda = normalizarTienda(String(fd.get('tienda') ?? ''))
  if (!tienda) return { error: 'Escribí la dirección de la tienda (tiene que ser https://).' }
  const problema = await direccionPermitida(tienda)
  if (problema) return { error: problema }
  let state: string
  try {
    state = crearFlujo({ tipo: 'woocommerce', empresaId: s.empresa.id, usuarioId: s.usuario.id, tienda })
  } catch {
    return { error: 'El servidor no tiene configurada la clave para guardar credenciales (ERP_CLAVE_MAESTRA).' }
  }
  redirect(urlAutorizacion(tienda, state, `${base()}/tiendas?woocommerce=1`, `${base()}/api/tiendas/woocommerce/claves`))
}

async function quienConecta() {
  const s = await requerirEmpresa()
  if (
    !tienePermiso(s.permisos, 'tienda.configurar') ||
    !s.suscripcion.funciones.includes('tienda') ||
    s.suscripcion.soloLectura
  ) {
    return null
  }
  return s
}

/** Shopify: con la tienda escrita, se va a su panel a aprobar los permisos. */
export async function conectarShopifyAccion(_: Estado, fd: FormData): Promise<Estado> {
  const s = await quienConecta()
  if (!s) return { error: 'No tenés permiso para conectar tiendas.' }
  if (!shopifyConfigurado()) return { error: 'La conexión con Shopify todavía no está habilitada en este servidor.' }
  const tienda = normalizarTiendaShopify(String(fd.get('tienda') ?? ''))
  if (!tienda) return { error: 'Escribí el nombre de la tienda en Shopify (algo.myshopify.com).' }
  let state: string
  try {
    state = crearFlujo({ tipo: 'shopify', empresaId: s.empresa.id, usuarioId: s.usuario.id, tienda })
  } catch {
    return { error: 'El servidor no tiene configurada la clave para guardar credenciales (ERP_CLAVE_MAESTRA).' }
  }
  redirect(urlAutorizacionShopify(tienda, state, `${base()}/api/tiendas/shopify/vuelta`))
}

/** Magento y PrestaShop: dirección y clave; se prueban antes de guardarlas. */
export async function conectarClaveAccion(tipo: 'magento' | 'prestashop', _: Estado, fd: FormData): Promise<Estado> {
  const s = await quienConecta()
  if (!s) return { error: 'No tenés permiso para conectar tiendas.' }
  const url = normalizarTienda(String(fd.get('tienda') ?? ''))
  const clave = String(fd.get('clave') ?? '').trim()
  if (!url) return { error: 'Escribí la dirección de la tienda (tiene que ser https://).' }
  if (clave.length < 16 || /\s/.test(clave))
    return { error: tipo === 'magento' ? 'Pegá el Access Token de la integración.' : 'Pegá la clave del servicio web.' }
  const problema = await direccionPermitida(url)
  if (problema) return { error: problema }
  const credenciales = tipo === 'magento' ? { url, token: clave } : { url, clave }
  try {
    if (tipo === 'magento') await probarMagento(fetch, { url, token: clave })
    else await probarPrestashop(fetch, { url, clave })
  } catch (e) {
    return { error: e instanceof ErrorCanal ? `No se pudo entrar a la tienda: ${e.message}` : 'No se pudo entrar a la tienda.' }
  }
  const r = await intentar(() =>
    enLaEmpresa('tienda.configurar', (tx, ses) =>
      conectarCanal(tx, ses.usuario.id, {
        tipo,
        nombre: `${tipo === 'magento' ? 'Magento' : 'PrestaShop'} · ${new URL(url).host}`,
        cuenta: url,
        credenciales,
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  try {
    await traerPublicaciones(s.empresa.id, r.id)
  } catch (e) {
    console.error('[tiendas] alta', tipo, e instanceof Error ? e.message : e)
  }
  revalidatePath('/tiendas')
  redirect(`/tiendas/${r.id}?conectado=1`)
}

export async function sincronizarAccion(id: string): Promise<Estado> {
  const s = await requerirEmpresa()
  if (!tienePermiso(s.permisos, 'tienda.configurar')) return { error: 'No tenés permiso para sincronizar.' }
  try {
    const p = await traerPublicaciones(s.empresa.id, id)
    const r = await sincronizarCanal(s.empresa.id, id)
    revalidatePath(`/tiendas/${id}`)
    if (!r.ok) return { error: r.error }
    return {
      ok: `${p.total} publicaciones (${p.sinVincular} sin vincular). ${r.importados} pedido${r.importados === 1 ? '' : 's'} nuevo${r.importados === 1 ? '' : 's'}. ${r.enviados} actualizacion${r.enviados === 1 ? '' : 'es'} de stock o precio enviadas${r.errores ? `, ${r.errores} con error` : ''}.`,
    }
  } catch (e) {
    revalidatePath(`/tiendas/${id}`)
    // Los errores de la plataforma ya vienen explicados; cualquier otro, sin detalles internos.
    if (e instanceof ErrorCanal) return { error: e.message }
    console.error('[tiendas] sincronizar', e instanceof Error ? e.message : e)
    return { error: 'No se pudo sincronizar. Probá de nuevo en un momento.' }
  }
}

export async function configurarAccion(id: string, _: Estado, fd: FormData): Promise<Estado> {
  const r = await intentar(() =>
    enLaEmpresa('tienda.configurar', (tx, s) =>
      configurarCanal(tx, s.usuario.id, id, {
        nombre: fd.get('nombre'),
        listaPreciosId: fd.get('listaPreciosId'),
        depositoId: fd.get('depositoId'),
        enviarStock: fd.has('enviarStock'),
        enviarPrecios: fd.has('enviarPrecios'),
        traerPedidos: fd.has('traerPedidos'),
        facturarSolo: fd.has('facturarSolo'),
        cuentaCobroId: fd.get('cuentaCobroId'),
        puntoVenta: fd.get('puntoVenta') || null,
      }),
    ),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tiendas/${id}`)
  return { ok: 'Guardado. Se aplica en la próxima sincronización.' }
}

export async function desconectarAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('tienda.configurar', (tx, s) => desconectarCanal(tx, s.usuario.id, id)))
  if (!r.ok) redirect(`/tiendas/${id}?error=${encodeURIComponent(r.error ?? '')}`)
  revalidatePath('/tiendas')
  redirect('/tiendas')
}

/** Vincula una publicación con el artículo de ese código (o la desvincula si el código queda vacío). */
export async function vincularAccion(canalId: string, publicacionId: string, _: Estado, fd: FormData): Promise<Estado> {
  const codigo = String(fd.get('codigo') ?? '').trim()
  const r = await intentar(() =>
    enLaEmpresa('tienda.configurar', async (tx, s) => {
      let articuloId: string | null = null
      if (codigo) {
        const [a] = await tx
          .select({ id: articulos.id })
          .from(articulos)
          .where(sql`lower(${articulos.codigo}) = lower(${codigo}) or ${articulos.codigoBarras} = ${codigo}`)
          .limit(1)
        if (!a) return { ok: false as const, error: `No hay ningún artículo con el código ${codigo}.` }
        articuloId = a.id
      }
      return vincularPublicacion(tx, s.usuario.id, publicacionId, articuloId)
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath(`/tiendas/${canalId}`)
  return { ok: codigo ? 'Vinculada.' : 'Desvinculada.' }
}
