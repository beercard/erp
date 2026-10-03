/** Partes del CRM que se usan también en el navegador. */

/** Variables de las plantillas de WhatsApp y email. */
export const VARIABLES = ['cliente', 'contacto', 'oportunidad', 'vendedor', 'empresa'] as const

/** Reemplaza {variables} con los datos de la oportunidad. Las desconocidas quedan como están. */
export function aplicarPlantilla(texto: string, datos: Partial<Record<(typeof VARIABLES)[number], string | null>>) {
  return (
    texto
      .replace(/\{(\w+)\}/g, (todo, v: string) => datos[v as (typeof VARIABLES)[number]] ?? todo)
      // "Empresa S.A." al final de una oración no deja dos puntos seguidos.
      .replace(/(?<!\.)\.\.(?!\.)/g, '.')
  )
}

/** Cómo salió una llamada (registro rápido de llamadas). */
export const DESENLACES_LLAMADA = {
  atendio: 'Atendió',
  no_atendio: 'No atendió',
  ocupado: 'Ocupado',
  mensaje: 'Dejé mensaje',
  numero_erroneo: 'Número equivocado',
} as const
