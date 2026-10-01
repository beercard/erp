'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { arcaConfiguracion, arcaTickets, percepcionesIibb } from '@/db/schema'
import { enLaEmpresa, exigirPermiso, SinPermiso } from '@/lib/auth/servidor'
import { auditar } from '@/lib/auditoria'
import { normalizarNumero } from '@/lib/dinero'
import { cifrar, revisarCertificado } from '@/modulos/arca/certificado'
import { clienteArca, probarServidores } from '@/modulos/arca/cliente'
import { eliminarBorrador, emitirComprobante, guardarComprobante, verificarComprobante } from '@/modulos/facturacion/comprobantes'
import { anularRecibo, emitirRecibo, pendientes, ReciboInvalido } from '@/modulos/facturacion/cuentas'

/** Ejecuta y convierte "sin permiso" en un mensaje para el usuario. */
async function intentar<T>(trabajo: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await trabajo()
  } catch (e) {
    if (e instanceof SinPermiso || e instanceof ReciboInvalido) return { ok: false, error: e.message }
    throw e
  }
}

function leerJson(texto: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(texto ?? 'null'))
  } catch {
    return null
  }
}

const conError = (ruta: string, error: string) => `${ruta}${ruta.includes('?') ? '&' : '?'}error=${encodeURIComponent(error)}`

// ------------------------------------------------------------- Comprobantes

export type EstadoFormulario = { error?: string; ok?: string } | undefined

export async function guardarComprobanteAccion(
  id: string | null,
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const datos = leerJson(formData.get('documento'))
  const r = await intentar(() =>
    enLaEmpresa('ventas.facturar', (tx, s) => guardarComprobante(tx, s.usuario.id, datos, id ?? undefined)),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/facturas')
  redirect(`/facturas/${r.id}?guardado=1`)
}

export async function emitirAccion(id: string) {
  const sesion = await exigirPermiso('ventas.facturar')
  const r = await emitirComprobante(sesion.empresa.id, sesion.usuario.id, id, (tx, cuit) => clienteArca(tx, cuit))
  revalidatePath('/facturas')
  revalidatePath(`/facturas/${id}`)
  if (!r.ok) redirect(conError(`/facturas/${id}`, r.error))
  redirect(
    `/facturas/${id}?emitido=1${r.observaciones.length ? `&avisos=${encodeURIComponent(r.observaciones.join('\n'))}` : ''}`,
  )
}

export async function verificarAccion(id: string) {
  const sesion = await exigirPermiso('ventas.facturar')
  const r = await verificarComprobante(sesion.empresa.id, sesion.usuario.id, id, (tx, cuit) => clienteArca(tx, cuit))
  revalidatePath(`/facturas/${id}`)
  if (!r.ok) redirect(conError(`/facturas/${id}`, r.error))
  redirect(`/facturas/${id}?emitido=1`)
}

export async function eliminarBorradorAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.facturar', (tx, s) => eliminarBorrador(tx, s.usuario.id, id)))
  if (!r.ok) redirect(conError(`/facturas/${id}`, r.error))
  revalidatePath('/facturas')
  redirect('/facturas')
}

// ---------------------------------------------------------------- Cobranzas

export async function pendientesDe(terceroId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(terceroId))) return []
  return enLaEmpresa('ventas.ver', (tx) => pendientes(tx, { terceroId }))
}

export async function emitirReciboAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const datos = leerJson(formData.get('recibo'))
  const r = await intentar(() => enLaEmpresa('ventas.cobrar', (tx, s) => emitirRecibo(tx, s.usuario.id, datos)))
  if (!r.ok) return { error: r.error }
  revalidatePath('/cobranzas')
  redirect(`/cobranzas/${r.id}?guardado=1`)
}

export async function anularReciboAccion(id: string) {
  const r = await intentar(() => enLaEmpresa('ventas.anular', (tx, s) => anularRecibo(tx, s.usuario.id, id)))
  revalidatePath(`/cobranzas/${id}`)
  if (!r.ok) redirect(conError(`/cobranzas/${id}`, r.error))
}

// ------------------------------------------------------- Configuración ARCA

async function textoDeArchivo(valor: FormDataEntryValue | null): Promise<string> {
  if (!valor) return ''
  if (typeof valor === 'string') return valor.trim()
  if (valor.size > 64 * 1024) return ''
  return (await valor.text()).trim()
}

export async function guardarCertificadoAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const certificado = await textoDeArchivo(formData.get('certificado'))
  const clave = await textoDeArchivo(formData.get('clave'))
  const ambiente = formData.get('ambiente') === 'produccion' ? 'produccion' : 'homologacion'
  if (!certificado || !clave) return { error: 'Subí los dos archivos: el certificado (.crt) y la clave privada (.key).' }
  const revision = revisarCertificado(certificado, clave)
  if (!revision.ok) return { error: revision.error }
  const r = await intentar(() =>
    enLaEmpresa('empresa.datos', async (tx, s) => {
      if (revision.datos.cuit && revision.datos.cuit !== s.empresa.cuit) {
        return { ok: false as const, error: `El certificado es del CUIT ${revision.datos.cuit}, no de esta empresa.` }
      }
      let claveCifrada: string
      try {
        claveCifrada = cifrar(clave)
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
      const valores = { ambiente, certificado, claveCifrada, certificadoVence: revision.datos.vence }
      await tx.insert(arcaConfiguracion).values(valores).onConflictDoUpdate({ target: arcaConfiguracion.empresaId, set: valores })
      // Con otro certificado, el ticket anterior ya no sirve.
      await tx.delete(arcaTickets)
      await auditar(tx, {
        usuarioId: s.usuario.id,
        accion: 'modificacion',
        entidad: 'arca_certificado',
        despues: { ambiente, vence: revision.datos.vence, titular: revision.datos.titular },
      })
      return { ok: true as const }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/configuracion/arca')
  return { ok: 'Certificado guardado. La clave privada quedó cifrada.' }
}

export async function cambiarAmbienteAccion(ambiente: 'homologacion' | 'produccion') {
  await enLaEmpresa('empresa.datos', async (tx, s) => {
    await tx.update(arcaConfiguracion).set({ ambiente })
    await auditar(tx, { usuarioId: s.usuario.id, accion: 'modificacion', entidad: 'arca_ambiente', despues: { ambiente } })
  })
  revalidatePath('/configuracion/arca')
}

/** Prueba completa: servidores de ARCA y, con certificado, el ticket de acceso. */
export async function probarConexionAccion(): Promise<EstadoFormulario> {
  const sesion = await exigirPermiso('empresa.datos')
  try {
    const r = await enLaEmpresa('empresa.datos', async (tx) => {
      const [config] = await tx.select().from(arcaConfiguracion)
      const ambiente = (config?.ambiente ?? 'homologacion') as 'homologacion' | 'produccion'
      const servidores = await probarServidores(ambiente)
      if (!config?.certificado) return `Servidores de ARCA (${ambiente}): ${servidores.aplicacion}. Falta el certificado.`
      const cliente = await clienteArca(tx, sesion.empresa.cuit)
      const ultimo = await cliente.ultimoAutorizado(1, 1).catch((e: Error) => `sin dato (${e.message})`)
      return `Conectado a ARCA en ${ambiente}: servidores ${servidores.aplicacion}, ticket de acceso vigente. Última factura A del punto de venta 1: ${ultimo}.`
    })
    return { ok: r }
  } catch (e) {
    return { error: `No se pudo conectar: ${(e as Error).message}` }
  }
}

export async function guardarPercepcionAccion(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const alicuota = normalizarNumero(String(formData.get('alicuota') ?? ''))
  const minimo = normalizarNumero(String(formData.get('minimoBase') ?? '0') || '0')
  if (!/^\d+(\.\d+)?$/.test(alicuota) || Number(alicuota) > 20) return { error: 'Escribí la alícuota general (por ejemplo 3,5).' }
  if (!/^\d+(\.\d+)?$/.test(minimo)) return { error: 'El mínimo tiene que ser un número.' }
  const valores = {
    nombre: String(formData.get('nombre') || 'Percepción IIBB').trim(),
    provincia: String(formData.get('provincia') || '') || null,
    alicuota,
    minimoBase: minimo,
    soloLetraA: formData.get('soloLetraA') === 'on',
    activa: formData.get('activa') === 'on',
  }
  const r = await intentar(() =>
    enLaEmpresa('empresa.datos', async (tx, s) => {
      const [actual] = await tx.select().from(percepcionesIibb).limit(1)
      if (actual) {
        await tx.update(percepcionesIibb).set(valores).where(eq(percepcionesIibb.id, actual.id))
      } else {
        await tx.insert(percepcionesIibb).values(valores)
      }
      await auditar(tx, {
        usuarioId: s.usuario.id,
        accion: 'modificacion',
        entidad: 'percepcion_iibb',
        antes: actual,
        despues: valores,
      })
      return { ok: true as const }
    }),
  )
  if (!r.ok) return { error: r.error }
  revalidatePath('/configuracion/arca')
  return { ok: valores.activa ? 'Percepción guardada y activa.' : 'Percepción guardada (inactiva).' }
}
