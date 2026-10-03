import { MARCA } from '@/lib/marca'

/** Isotipo: una V formada por dos trazos que convergen (vector, dirección). */
export function Isotipo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-acento" />
      <path
        d="M8.5 9.5 L16 23 L23.5 9.5"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-sobre-acento"
      />
      <circle cx="23.5" cy="9.5" r="2.2" className="fill-sobre-acento" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <Isotipo />
      <span className="text-[17px] font-semibold tracking-tight whitespace-nowrap">
        {MARCA.corto}
        <span className="font-normal text-texto-2"> ERP</span>
      </span>
    </span>
  )
}
