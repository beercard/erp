'use client'

import { useActionState, useState, useTransition } from 'react'

import { Aviso, Boton } from '@/components/ui'

import { importarAccion, leerImportacionAccion, type Vista } from './acciones'
import type { TipoImportacion } from './tipos'

type Hecho = Awaited<ReturnType<typeof importarAccion>>

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`

/** Errores por fila, con tope para no armar una lista eterna (la planilla se corrige y se vuelve a subir). */
function Errores({ errores }: { errores: { fila: number; error: string }[] }) {
  if (errores.length === 0) return null
  return (
    <div className="text-xs">
      <p className="font-medium text-error">
        {plural(errores.length, 'fila no se va a importar', 'filas no se van a importar')}:
      </p>
      <ul className="mt-1 max-h-48 overflow-auto rounded-md bg-superficie-2 p-2">
        {errores.slice(0, 100).map((e, i) => (
          <li key={i}>
            <span className="cifras text-texto-3">Fila {e.fila}:</span> {e.error}
          </li>
        ))}
        {errores.length > 100 && <li className="text-texto-3">…y {errores.length - 100} más.</li>}
      </ul>
    </div>
  )
}

/**
 * Subir → vista previa (qué se da de alta, qué se actualiza y qué filas tienen errores) → confirmar. La confirmación
 * manda las filas leídas y el servidor las vuelve a validar enteras.
 */
export function Importador({ tipo }: { tipo: TipoImportacion }) {
  const [vista, leer, leyendo] = useActionState(leerImportacionAccion.bind(null, tipo), undefined)
  const [hecho, setHecho] = useState<{ de: Vista; r: Hecho } | null>(null)
  const [importando, empezar] = useTransition()
  const resultado = hecho && hecho.de === vista ? hecho.r : null

  const importar = () =>
    empezar(async () => {
      if (!vista?.registros) return
      setHecho({ de: vista, r: await importarAccion(tipo, vista.registros) })
    })

  return (
    <div className="flex h-fit flex-col gap-3 rounded-xl border border-borde p-3">
      <form action={leer} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="file"
          name="planilla"
          accept=".csv,.xlsx"
          required
          aria-label="Planilla"
          className="max-w-full min-w-0 flex-1 text-sm file:mr-2 file:h-9 file:rounded-md file:border file:border-borde file:bg-superficie file:px-3 file:text-sm"
        />
        <Boton type="submit" disabled={leyendo || importando}>
          {leyendo ? 'Leyendo…' : 'Revisar'}
        </Boton>
      </form>
      {vista?.error && <Aviso>{vista.error}</Aviso>}
      {vista?.registros && !resultado && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <span className="text-texto-2">{vista.nombre}:</span>{' '}
            {vista.validas ? (
              <>
                {tipo === 'saldos'
                  ? plural(vista.altas ?? 0, 'saldo para cargar', 'saldos para cargar')
                  : `${plural(vista.altas ?? 0, 'alta', 'altas')} y ${plural(vista.actualizaciones ?? 0, 'actualización', 'actualizaciones')}`}
                .
              </>
            ) : (
              'ninguna fila se puede importar.'
            )}
          </p>
          <Errores errores={vista.errores ?? []} />
          {Boolean(vista.validas) && (
            <Boton type="button" variante="primario" className="w-fit" disabled={importando} onClick={importar}>
              {importando ? 'Importando…' : `Importar ${plural(vista.validas ?? 0, 'fila', 'filas')}`}
            </Boton>
          )}
        </div>
      )}
      {resultado?.error && <Aviso>{resultado.error}</Aviso>}
      {resultado && !resultado.error && (
        <>
          <Aviso tono="ok">
            Listo:{' '}
            {tipo === 'saldos'
              ? plural(resultado.altas ?? 0, 'saldo cargado', 'saldos cargados')
              : `${plural(resultado.altas ?? 0, 'alta', 'altas')} y ${plural(resultado.actualizados ?? 0, 'actualización', 'actualizaciones')}`}
            .
          </Aviso>
          <Errores errores={resultado.errores ?? []} />
        </>
      )}
    </div>
  )
}
