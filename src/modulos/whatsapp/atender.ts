import { eq } from 'drizzle-orm'

import { conEmpresa, comoPlataforma } from '../../db/empresa'
import { empresas, whatsappConversaciones, whatsappMensajes } from '../../db/schema'
import { guardarRecibida, marcarSinLectura, procesarRecibida, tipoDeArchivo } from '../compras/recibidas'
import { iaConfigurada } from '../ia/claude'
import { bajarMedio, ErrorWhatsapp, marcarLeido, type Fetch } from './api'
import { base, credencialesDe, enviarAConversacion, type Entrante } from './whatsapp'

/**
 * Qué se hace con cada mensaje que entra (después de responderle a Meta):
 * se marca leído y, según quién escribe, va al registro de facturas (gente
 * de la empresa autorizada) o al agente de atención (clientes).
 */
export async function atenderEntrantes(entrantes: Entrante[], f: Fetch = fetch) {
  for (const e of entrantes) {
    const cred = await credencialesDe(e.empresaId)
    if (!cred) continue
    await marcarLeido(f, cred.credenciales, e.mensaje.externoId)
    const [conv] = await conEmpresa(e.empresaId, (tx) =>
      tx.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.id, e.conversacionId)),
    )
    if (!conv) continue
    if (conv.usuarioId) {
      if (cred.cuenta.registroFacturas) await registrarFactura(e, conv.usuarioId, cred.credenciales, f)
      continue
    }
    if (cred.cuenta.agente && conv.atiende === 'agente' && conv.estado === 'abierta') {
      // El agente se carga solo si hace falta (usa la IA).
      const { responderConAgente } = await import('./agente')
      await responderConAgente(e, f)
    }
  }
}

const sistema = { tipo: 'sistema' as const }

async function anotar(empresaId: string, mensajeId: string, datos: Record<string, unknown>) {
  await conEmpresa(empresaId, (tx) => tx.update(whatsappMensajes).set({ datos }).where(eq(whatsappMensajes.id, mensajeId)))
}

/** Foto o PDF de una factura de proveedor que manda alguien autorizado de la empresa. */
async function registrarFactura(e: Entrante, usuarioId: string, cred: { numeroId: string; token: string }, f: Fetch) {
  const m = e.mensaje
  if (!m.medio) {
    await enviarAConversacion(
      e.empresaId,
      e.conversacionId,
      'Para cargar una factura de proveedor, mandame la foto (bien derecha y con buena luz) o el PDF. Quedan para revisar en Compras → Facturas recibidas.',
      sistema,
      f,
    )
    return
  }
  let archivo: Buffer
  try {
    archivo = (await bajarMedio(f, cred, m.medio.id)).datos
  } catch (err) {
    await enviarAConversacion(
      e.empresaId,
      e.conversacionId,
      `No pude bajar el archivo: ${err instanceof ErrorWhatsapp ? err.message : 'probá de nuevo'}.`,
      sistema,
      f,
    )
    return
  }
  const tipo = tipoDeArchivo(archivo)
  if (!tipo) {
    await enviarAConversacion(e.empresaId, e.conversacionId, 'Ese archivo no es una foto (JPG, PNG) ni un PDF.', sistema, f)
    return
  }
  const id = await conEmpresa(e.empresaId, (tx) =>
    guardarRecibida(tx, { usuarioId, conversacionId: e.conversacionId, archivo, tipo, nombre: m.medio?.nombre }),
  )
  const enlace = `${base()}/compras/recibidas/${id}`
  if (!iaConfigurada()) {
    await conEmpresa(e.empresaId, (tx) => marcarSinLectura(tx, id))
    await anotar(e.empresaId, e.mensajeId, { facturaRecibida: id, nota: 'Factura guardada para cargar a mano.' })
    await enviarAConversacion(
      e.empresaId,
      e.conversacionId,
      `Recibí el archivo. Quedó para cargar a mano en Compras → Facturas recibidas:\n${enlace}`,
      sistema,
      f,
    )
    return
  }
  const [empresa] = await comoPlataforma((tx) =>
    tx.select({ cuit: empresas.cuit }).from(empresas).where(eq(empresas.id, e.empresaId)),
  )
  const r = await procesarRecibida(e.empresaId, id, empresa?.cuit ?? '', f)
  await anotar(e.empresaId, e.mensajeId, {
    facturaRecibida: id,
    nota: r ? 'Factura leída: lista para revisar.' : 'No se pudo leer la factura.',
  })
  if (!r) {
    await enviarAConversacion(
      e.empresaId,
      e.conversacionId,
      `Guardé el archivo pero no pude leerlo. Completalo a mano acá:\n${enlace}`,
      sistema,
      f,
    )
    return
  }
  const l = r.lectura
  const pesos = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }))
  const resumen = [
    `Leí ${l.clase === 'nota_credito' ? 'la nota de crédito' : l.clase === 'nota_debito' ? 'la nota de débito' : 'la factura'} ${l.letra ?? ''} ${String(l.puntoVenta ?? '').padStart(5, '0')}-${String(l.numero ?? '').padStart(8, '0')}`,
    `de ${l.razonSocialEmisor ?? 'proveedor sin nombre'} (CUIT ${l.cuitEmisor ?? '—'}), del ${l.fecha?.split('-').reverse().join('/') ?? '—'}, por ${pesos(l.total)}.`,
    ...(r.avisos.length ? ['', 'Para revisar:', ...r.avisos.map((a) => `• ${a}`)] : []),
    '',
    `Revisala y registrala acá:\n${enlace}`,
  ].join('\n')
  await enviarAConversacion(e.empresaId, e.conversacionId, resumen, sistema, f)
}
