import { marcarLeido, type Fetch } from './api'
import { credencialesDe, type Entrante } from './whatsapp'

/**
 * Qué se hace con cada mensaje que entra (después de responderle a Meta):
 * se marca leído y, según quién escribe, va al registro de facturas o al
 * agente de atención.
 */
export async function atenderEntrantes(entrantes: Entrante[], f: Fetch = fetch) {
  for (const e of entrantes) {
    const cred = await credencialesDe(e.empresaId)
    if (!cred) continue
    await marcarLeido(f, cred.credenciales, e.mensaje.externoId)
  }
}
