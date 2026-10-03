const soloDigitos = (t: string) => t.replace(/\D/g, '')

export const telefonoLlamar = (t: string) => `tel:${soloDigitos(t)}`

/** WhatsApp con código de país: si el número es local, se le agrega 549 (y se saca el 15). */
export const telefonoWhatsapp = (t: string, texto?: string) => {
  const d = soloDigitos(t)
  const numero = d.startsWith('54') ? d : `549${d.replace(/^0/, '').replace(/^(\d{2,4})15/, '$1')}`
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
