/** Tema de colores elegido por la persona; se guarda en el navegador y lo aplica el layout raíz antes de pintar. */
export type Tema = 'sistema' | 'claro' | 'oscuro'

const CLAVE_TEMA = 'erp:tema'

export function aplicarTema(t: Tema) {
  if (t === 'sistema') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = t
  try {
    if (t === 'sistema') localStorage.removeItem(CLAVE_TEMA)
    else localStorage.setItem(CLAVE_TEMA, t)
  } catch {
    // Sin almacenamiento: vale para esta pestaña.
  }
}

/** El tema que se ve ahora (el elegido o, si no hay, el del sistema). */
export function temaVisible(): 'claro' | 'oscuro' {
  const t = document.documentElement.dataset.tema
  if (t === 'claro' || t === 'oscuro') return t
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}
