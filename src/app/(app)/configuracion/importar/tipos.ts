/** Las tres importaciones: permiso, planilla modelo y textos (sin servidor: lo usa también la pantalla). */
export const IMPORTACIONES = {
  terceros: {
    titulo: 'Clientes y proveedores',
    permiso: 'maestros.terceros',
    detalle:
      'Se buscan por CUIT o DNI (o por código): si ya están, se actualizan con lo que traiga la planilla; lo que venga vacío no se toca.',
    columnas: [
      ['razon_social', 'Obligatoria.'],
      ['cuit', 'CUIT (11 dígitos) o DNI. Se valida el dígito verificador.'],
      ['condicion_iva', 'RI, Monotributo, Exento o Consumidor final.'],
      ['tipo', 'cliente (por defecto), proveedor o ambos.'],
      ['email, telefono, domicilio, localidad, codigo_postal, provincia', 'Opcionales.'],
      ['codigo', 'Opcional: si no viene, se numera solo.'],
    ],
    modelo: [
      ['codigo', 'razon_social', 'cuit', 'condicion_iva', 'tipo', 'email', 'telefono', 'domicilio', 'localidad', 'provincia'],
      [
        '',
        'Ejemplo S.A.',
        '30999176522',
        'RI',
        'cliente',
        'pagos@ejemplo.com',
        '011 4000-0000',
        'Mitre 100',
        'Rosario',
        'Santa Fe',
      ],
      ['', 'Ana Gómez', '27333444', 'Consumidor final', 'cliente', '', '', '', '', ''],
      ['', 'Insumos Norte S.R.L.', '30715974823', 'RI', 'proveedor', '', '', '', '', ''],
    ],
  },
  articulos: {
    titulo: 'Artículos, precios y stock',
    permiso: 'maestros.articulos',
    detalle:
      'Se buscan por código: si ya está, se actualiza. El precio va a la lista general desde hoy; el stock inicial entra solo en los artículos nuevos, en el primer depósito.',
    columnas: [
      ['codigo, nombre', 'Obligatorios.'],
      ['tipo', 'producto (por defecto) o servicio (no lleva stock).'],
      ['iva', '21 (por defecto), 10,5, 27, 5, 2,5 o 0.'],
      ['costo, moneda', 'Costo y su moneda (PES o DOL).'],
      ['precio', 'Precio de venta sin IVA de la lista general.'],
      ['rubro, marca', 'Por nombre: si no existen, se crean.'],
      ['stock, stock_minimo, unidad, codigo_barras, descripcion', 'Opcionales.'],
    ],
    modelo: [
      ['codigo', 'nombre', 'tipo', 'iva', 'costo', 'moneda', 'precio', 'rubro', 'marca', 'stock', 'unidad'],
      ['TN-1001', 'Tóner negro', 'producto', '21', '10000', 'PES', '15000', 'Insumos', 'Acme', '12', 'unidad'],
      ['SV-1', 'Visita técnica', 'servicio', '21', '', '', '25000', 'Servicios', '', '', 'unidad'],
    ],
  },
  saldos: {
    titulo: 'Saldos iniciales de cuentas corrientes',
    permiso: 'empresa.datos',
    detalle:
      'Lo que te deben tus clientes y lo que les debés a tus proveedores al empezar. Entra como saldo inicial: no va al Libro IVA ni a la contabilidad y se cancela con cobranzas y pagos. Los clientes y proveedores tienen que estar cargados antes.',
    columnas: [
      ['cuit', 'CUIT o DNI del cliente o proveedor. Obligatorio.'],
      ['cuenta', 'cliente (por defecto) o proveedor.'],
      ['saldo', 'Positivo: deuda. Negativo: saldo a favor del cliente o proveedor.'],
      ['fecha, vencimiento', 'DD/MM/AAAA. Sin fecha, hoy.'],
      ['detalle', 'Opcional.'],
    ],
    modelo: [
      ['cuit', 'cuenta', 'saldo', 'fecha', 'vencimiento', 'detalle'],
      ['30999176522', 'cliente', '125000,50', '30/09/2026', '15/10/2026', 'Facturas de septiembre'],
      ['27333444', 'cliente', '-3000', '30/09/2026', '', 'Pago a cuenta'],
      ['30715974823', 'proveedor', '80000', '30/09/2026', '', ''],
    ],
  },
} as const

export type TipoImportacion = keyof typeof IMPORTACIONES
export const esTipoImportacion = (v: unknown): v is TipoImportacion => typeof v === 'string' && v in IMPORTACIONES
