import { sql } from 'drizzle-orm'
import { check, customType, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { empresaId, id, marcasDeTiempo } from './comunes'

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => Buffer.from(v),
})

/**
 * La imagen de la empresa en sus comprobantes: el logo (PNG, JPG o WebP,
 * chico) y el diseño de la factura (clásico, moderno o compacto) con su
 * color. Aparte de empresas para no traer la imagen en cada lectura.
 */
export const empresaMarca = pgTable(
  'empresa_marca',
  {
    id: id(),
    empresaId: empresaId(),
    logo: bytea('logo'),
    /** image/png | image/jpeg | image/webp */
    logoTipo: text('logo_tipo'),
    /** clasico | moderno | compacto */
    diseno: text('diseno').notNull().default('clasico'),
    /** Color principal (#rrggbb) del diseño moderno y los acentos. */
    color: text('color').notNull().default('#0f766e'),
    ...marcasDeTiempo(),
  },
  (t) => [
    uniqueIndex().on(t.empresaId),
    check('empresa_marca_diseno', sql`${t.diseno} in ('clasico', 'moderno', 'compacto')`),
    check('empresa_marca_color', sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
    check('empresa_marca_logo', sql`${t.logoTipo} is null or ${t.logoTipo} in ('image/png', 'image/jpeg', 'image/webp')`),
  ],
)
