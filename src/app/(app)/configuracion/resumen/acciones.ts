'use server'

import { revalidatePath } from 'next/cache'

import { enLaEmpresa, SinPermiso } from '@/lib/auth/servidor'
import { enviarResumenDueno, guardarConfiguracionResumen } from '@/modulos/informes/resumenDueno'

type Estado = { error?: string; aviso?: string } | undefined

export async function guardarResumenAccion(_: Estado, fd: FormData): Promise<Estado> {
  try {
    const empresaId = await enLaEmpresa('empresa.datos', async (tx, s) => {
      const r = await guardarConfiguracionResumen(tx, s.empresa.id, {
        frecuencia: fd.get('frecuencia'),
        diaSemana: fd.get('diaSemana'),
        correos: fd.get('correos'),
        telefonos: fd.get('telefonos'),
      })
      if (!r.ok) throw new Error(r.error)
      return s.empresa.id
    })
    revalidatePath('/configuracion/resumen')
    if (fd.get('probar')) {
      const r = await enviarResumenDueno(empresaId, { forzar: true })
      return r.errores.length
        ? { error: `Se mandó a ${r.enviados} destino(s). No salió a: ${r.errores.join('; ')}` }
        : { aviso: `Guardado y enviado a ${r.enviados} destino(s).` }
    }
    return { aviso: 'Guardado.' }
  } catch (e) {
    if (e instanceof SinPermiso || e instanceof Error) return { error: e.message }
    throw e
  }
}
