import { exigirPermiso } from '@/lib/auth/servidor'
import { escribirXlsx, TIPO_XLSX } from '@/lib/xlsx'

/** GET /facturas/masiva/modelo: la planilla modelo para la facturación masiva. */
export async function GET() {
  await exigirPermiso('ventas.facturar')
  const xlsx = escribirXlsx([
    {
      nombre: 'Facturas',
      filas: [
        [
          'factura',
          'cuit',
          'razon_social',
          'condicion_iva',
          'email',
          'concepto',
          'descripcion',
          'cantidad',
          'precio',
          'iva',
          'referencia',
        ],
        [1, '30999176522', 'Ejemplo S.A.', 'RI', 'pagos@ejemplo.com', 'servicios', 'Abono octubre', 1, 25000, 21, 'A-1001'],
        [1, '30999176522', '', '', '', '', 'Visita técnica', 2, 8000, 21, ''],
        [2, '27333444', 'Ana Gómez', 'Consumidor final', 'ana@ejemplo.com', 'productos', 'Curso online', 1, 15000, 21, 'A-1002'],
      ],
    },
    {
      nombre: 'Cómo completarla',
      filas: [
        ['Columna', 'Qué va'],
        ['factura', 'Mismo número = misma factura (varios renglones). Vacío: cada fila es una factura.'],
        ['cuit', 'CUIT (11 dígitos) o DNI del cliente. Si no existe, se da de alta.'],
        ['razon_social', 'Nombre del cliente nuevo. Con CUIT y vacío, se busca en el padrón de ARCA.'],
        ['condicion_iva', 'RI, Monotributo, Exento o Consumidor final (define si es A o B).'],
        ['email', 'Para mandarle la factura.'],
        ['concepto', 'productos, servicios o productos y servicios.'],
        ['descripcion', 'El renglón de la factura.'],
        ['cantidad', 'Por defecto 1.'],
        ['precio', 'Precio unitario sin IVA (1234,50 o 1234.50).'],
        ['iva', '21, 10,5, 27, 5, 2,5 o 0. Por defecto 21.'],
        ['referencia', 'Opcional: tu número de venta. Si se repite, no se factura dos veces.'],
        ['fecha', 'Opcional (DD/MM/AAAA): por defecto, hoy.'],
      ],
    },
  ])
  return new Response(Buffer.from(xlsx), {
    headers: { 'content-type': TIPO_XLSX, 'content-disposition': 'attachment; filename="facturacion-masiva.xlsx"' },
  })
}
