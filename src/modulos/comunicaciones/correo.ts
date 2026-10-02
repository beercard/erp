import { and, asc, eq, inArray, lt } from 'drizzle-orm'
import nodemailer from 'nodemailer'

import type { Transaccion } from '../../db/conexion'
import { correos } from '../../db/schema'
import { conEmpresa } from '../../db/empresa'

/**
 * Correos de la empresa. Se encolan dentro de la transacción de la operación
 * (si se revierte, no sale ningún aviso) y se mandan después, fuera de ella,
 * por SMTP. El servidor se configura con:
 *
 *   SMTP_URL          smtp://usuario:clave@servidor:587 (o smtps://…:465)
 *   CORREO_REMITENTE  "Servicio técnico <avisos@empresa.com.ar>"
 *
 * Sin SMTP_URL los correos quedan pendientes en la bandeja de salida: se ven
 * en la orden y se pueden mandar a mano (o por WhatsApp).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const emailValido = (v: string | null | undefined): v is string => !!v && EMAIL.test(v.trim())
export const correoConfigurado = () => !!process.env.SMTP_URL
const MAXIMO_INTENTOS = 5

export async function encolarCorreo(
  tx: Transaccion,
  c: { para: string; asunto: string; texto: string; entidad?: string; entidadId?: string; usuarioId?: string | null },
) {
  const para = c.para.trim()
  if (!emailValido(para)) return null
  const [fila] = await tx
    .insert(correos)
    .values({
      para,
      asunto: c.asunto.slice(0, 200),
      texto: c.texto,
      entidad: c.entidad ?? null,
      entidadId: c.entidadId ?? null,
      usuarioId: c.usuarioId ?? null,
    })
    .returning({ id: correos.id })
  return fila.id
}

export async function correosDe(tx: Transaccion, entidad: string, entidadId: string) {
  return tx
    .select()
    .from(correos)
    .where(and(eq(correos.entidad, entidad), eq(correos.entidadId, entidadId)))
    .orderBy(asc(correos.creado))
}

let transporte: nodemailer.Transporter | null = null
function smtp() {
  transporte ??= nodemailer.createTransport(process.env.SMTP_URL!)
  return transporte
}

/**
 * Manda los pendientes de una empresa. Cada envío se registra en su propia
 * transacción corta: nunca se espera al servidor de correo con la base
 * bloqueada. Devuelve cuántos salieron y cuántos fallaron.
 */
export async function enviarPendientes(empresaId: string, limite = 25) {
  if (!correoConfigurado()) return { enviados: 0, fallidos: 0 }
  const lote = await conEmpresa(empresaId, (tx) =>
    tx
      .select()
      .from(correos)
      .where(and(inArray(correos.estado, ['pendiente', 'error']), lt(correos.intentos, MAXIMO_INTENTOS)))
      .orderBy(asc(correos.creado))
      .limit(limite),
  )
  let enviados = 0
  let fallidos = 0
  for (const c of lote) {
    try {
      await smtp().sendMail({
        from: process.env.CORREO_REMITENTE ?? 'Servicio técnico <no-responder@localhost>',
        to: c.para,
        subject: c.asunto,
        text: c.texto,
      })
      await conEmpresa(empresaId, (tx) =>
        tx
          .update(correos)
          .set({ estado: 'enviado', enviado: new Date(), intentos: c.intentos + 1, error: null })
          .where(eq(correos.id, c.id)),
      )
      enviados++
    } catch (e) {
      await conEmpresa(empresaId, (tx) =>
        tx
          .update(correos)
          .set({ estado: 'error', intentos: c.intentos + 1, error: String((e as Error).message ?? e).slice(0, 500) })
          .where(eq(correos.id, c.id)),
      )
      fallidos++
    }
  }
  return { enviados, fallidos }
}

/**
 * Enlace de WhatsApp con el texto listo (wa.me). Teléfonos argentinos: se
 * saca el 0 de larga distancia y el 15, y se agrega 549.
 */
export function enlaceWhatsapp(telefono: string | null | undefined, texto: string) {
  let n = (telefono ?? '').replace(/\D/g, '')
  if (!n) return `https://wa.me/?text=${encodeURIComponent(texto)}`
  if (!n.startsWith('54')) {
    n = n.replace(/^0/, '')
    // Con el 15 son 12 dígitos (área de 2 a 4 + 15 + número): 11 15 1234-5678 → 11 1234-5678.
    if (n.length === 12) {
      const area = [2, 3, 4].find((a) => n.slice(a, a + 2) === '15')
      if (area) n = n.slice(0, area) + n.slice(area + 2)
    }
    n = `549${n}`
  } else if (!n.startsWith('549')) {
    n = `549${n.slice(2)}`
  }
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}
