import { ImageResponse } from 'next/og'

import { MARCA } from '@/lib/marca'

export const alt = `${MARCA.producto}: sistema de gestión y facturación electrónica para pymes`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Imagen para cuando se comparte un enlace (WhatsApp, LinkedIn, X). */
export default function Imagen() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #0b6b77 0%, #08434b 60%, #062d33 100%)',
        color: 'white',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill="white" />
          <path
            d="M8.5 9.5 L16 23 L23.5 9.5"
            fill="none"
            stroke="#0b6b77"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23.5" cy="9.5" r="2.2" fill="#0b6b77" />
        </svg>
        <span style={{ fontSize: 44, fontWeight: 700 }}>{MARCA.producto}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          Facturá, controlá el stock y vendé online desde un solo sistema
        </span>
        <span style={{ fontSize: 30, opacity: 0.85 }}>
          Facturación electrónica ARCA · Stock · Compras · Bancos · Mercado Libre
        </span>
      </div>
    </div>,
    size,
  )
}
