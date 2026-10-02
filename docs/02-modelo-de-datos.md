# Modelo de datos

Entidades por módulo y la etapa en que se implementa cada una. Las tablas marcadas **global** no tienen `empresa_id` y las comparten todas las empresas. Todas las demás tienen `empresa_id` con RLS forzado (ver [01-arquitectura.md](01-arquitectura.md#2-multiempresa)).

Convenciones:
- Claves primarias `uuid` (`gen_random_uuid()`).
- `creado` y `actualizado` en `timestamptz`.
- Los códigos que el usuario ve (`codigo`) son únicos por empresa.

## Etapa 0: cimientos

### Plataforma (global)
| Tabla | Para qué |
|---|---|
| `empresas` | Cada cliente del SaaS: razón social, CUIT, condición de IVA, domicilio fiscal, inicio de actividades, IIBB, moneda funcional, plan y módulos activos |
| `usuarios` | Personas que entran al sistema: email único, nombre, hash de la clave, activo |
| `sesiones` | Sesiones abiertas: hash del token, usuario, empresa activa, vencimiento, IP y navegador |
| `membresias` | Usuario × empresa × rol, activa o no |
| `roles` | Lista de permisos. Con `empresa_id` nulo es un rol de sistema; con valor, es propio de la empresa |

### Catálogos fiscales (global, códigos de ARCA)
| Tabla | Contenido |
|---|---|
| `condiciones_iva` | IVA Responsable Inscripto (1), Sujeto Exento (4), Consumidor Final (5), Responsable Monotributo (6), Sujeto No Categorizado (7), Proveedor del Exterior (8), Cliente del Exterior (9), IVA Liberado Ley 19.640 (10), Monotributista Social (13), IVA No Alcanzado (15), Monotributo Trabajador Independiente Promovido (16) |
| `tipos_documento` | CUIT (80), CUIL (86), CDI (87), LE (89), LC (90), CI extranjera (91), Pasaporte (94), DNI (96), Sin identificar (99) |
| `alicuotas_iva` | 0 % (3), 10,5 % (4), 21 % (5), 27 % (6), 5 % (8), 2,5 % (9) |
| `monedas` | Código de ARCA (PES, DOL, 060…), código ISO y símbolo |
| `provincias` | Código ISO 3166-2 y código de jurisdicción del Convenio Multilateral (901 a 924) |
| `cotizaciones` | Moneda, fecha, fuente (BNA, BCRA, manual) y valor `numeric(18,6)` |

### Auditoría
| Tabla | Para qué |
|---|---|
| `auditoria` | Empresa, usuario, fecha, acción, entidad, id, datos antes y después (`jsonb`), IP. Solo de agregado |

### Maestros (por empresa)
| Tabla | Para qué |
|---|---|
| `terceros` | **Clientes y proveedores en una sola tabla**, con marcas `es_cliente` y `es_proveedor`. Guarda datos fiscales, contacto, domicilio y condiciones comerciales (lista, vendedor, condición de pago, límite de crédito, descuento) |
| `terceros_contactos` | Personas de contacto de cada tercero (nombre, cargo, email, teléfono) |
| `rubros` | Árbol de rubros y subrubros (`padre_id`) |
| `marcas` | Marcas de artículos |
| `articulos` | Productos y servicios: código, nombre, rubro, marca, unidad, alícuota de IVA, si lleva stock, si lleva número de serie, costo y moneda del costo |
| `listas_precios` | Lista base o derivada de otra con recargo o descuento. Ej.: "Tarjeta 6 cuotas" = lista base + 49 %. Moneda, si incluye IVA y vigencia |
| `precios` | Precio por lista y artículo, con `vigente_desde` (queda el historial) |
| `depositos` | Depósitos de stock |
| `puntos_venta` | Número, nombre y tipo: electrónico (WSFE), factura de crédito electrónica, manual o solo remitos |
| `condiciones_pago` | Contado, cuenta corriente a N días, cuotas |
| `vendedores` | Comisión por venta y por cobranza; puede estar vinculado a un usuario |
| `zonas`, `transportes` | Datos comerciales auxiliares |

## Etapa 1: comercial

| Tabla | Para qué |
|---|---|
| `presupuestos`, `presupuestos_items` | Cotizaciones con estado (borrador, enviado, aceptado, rechazado, vencido) y validez |
| `pedidos`, `pedidos_items` | Pedidos de clientes, incluidos los de la tienda online (origen y id externo) |
| `remitos`, `remitos_items` | Entregas, con numeración propia |
| `movimientos_stock` | Cada entrada, salida, transferencia o ajuste, con su origen (remito, compra, ajuste). **El stock se calcula de acá** |
| `series` | Números de serie de artículos que los llevan (equipos) |

## Etapa 2: facturación y cobranzas

| Tabla | Para qué |
|---|---|
| `tipos_comprobante` (global) | Códigos de ARCA: factura A (1), ND A (2), NC A (3), factura B (6), ND B (7), NC B (8), FCE MiPyME A (201), etc. |
| `numeradores` | Último número por punto de venta y tipo de comprobante. Se bloquea la fila al emitir |
| `comprobantes` | Cabecera de facturas, notas de crédito y débito: tercero, fecha, moneda, cotización, totales, CAE y vencimiento, estado. Inmutable una vez emitido |
| `comprobantes_items` | Renglones con artículo, cantidad, precio, descuento y alícuota |
| `comprobantes_tributos` | Un renglón por impuesto: IVA por alícuota, percepciones de IIBB por jurisdicción, percepción de IVA, impuestos internos |
| `comprobantes_asociados` | Notas de crédito y débito vinculadas a la factura que corrigen |
| `recibos`, `recibos_valores` | Cobranzas y los valores con que se pagó (efectivo, transferencia, cheque, ECHEQ, tarjeta, Mercado Pago, retenciones sufridas) |
| `imputaciones` | Qué comprobantes cancela cada recibo o nota de crédito, y por cuánto |
| `padron_iibb` | Alícuotas de percepción y retención por CUIT y jurisdicción, con vigencia (ATP Chaco, ARBA, AGIP…) |

## Etapa 3: compras y pagos

| Tabla | Para qué |
|---|---|
| `compras`, `compras_items`, `compras_tributos` | Comprobantes de proveedores (también importados de Mis Comprobantes), con IVA crédito y percepciones sufridas |
| `ordenes_compra` | Pedidos a proveedores |
| `ordenes_pago`, `ordenes_pago_valores` | Pagos y con qué se pagó |
| `retenciones` | Retenciones practicadas (Ganancias, IVA, IIBB, SUSS) con su certificado numerado |
| `regimenes_retencion` (global) | Escalas y alícuotas por régimen, con vigencia |

## Etapa 4: tesorería

| Tabla | Para qué |
|---|---|
| `cuentas_fondos` | Cajas, cuentas bancarias, billeteras (Mercado Pago) y cartera de valores |
| `movimientos_fondos` | Cada ingreso, egreso o transferencia entre cuentas |
| `valores` | Cheques y ECHEQ de terceros y propios, con su estado (en cartera, depositado, endosado, rechazado) |
| `extractos`, `extractos_lineas` | Extractos bancarios importados para conciliar |
| `cupones_tarjeta` | Cupones de tarjeta y su acreditación |

## Etapa 5: parque instalado y contratos (módulo opcional)

| Tabla | Para qué |
|---|---|
| `equipos` | Equipos instalados en clientes: serie, modelo, domicilio de instalación, fecha de alta y retiro, garantía |
| `contratos` | Cliente, modalidad (excedente, abono, leasing, copias con tope, full print, comodato…), vigencia, facturación adelantada o vencida, grupo de equipos que suman copias juntos |
| `contratos_tarifas` | Cargo fijo, copias libres, precio por copia por tramos, color y blanco y negro, mínimo |
| `lecturas` | Contador de cada equipo por fecha: manual, desde MPS Monitor o cargada por el técnico, más las copias de prueba que no se cobran |
| `liquidaciones` | Cálculo mensual de cada contrato, que genera las facturas |
| `tecnicos` | Quienes atienden el servicio técnico (maestro simple de Configuración) |
| `ordenes_servicio` | Servicio técnico: pedido del cliente sobre un equipo, técnico y día de visita, quién paga (contrato, garantía o con cargo), solución y contador al resolver. Se cancela, no se borra |
| `ordenes_servicio_visitas` | Cada visita del técnico, con lo que hizo y las horas |
| `ordenes_servicio_items` | Insumos, repuestos y mano de obra: un artículo con stock sale del depósito al cargarlo y vuelve si se quita. Lo que tiene precio se factura en borrador si la orden es con cargo |
| `etiquetas_servicio`, `ordenes_servicio_etiquetas` | Etiquetas de colores de las órdenes (varias por orden), para filtrar y verlas en el calendario |
| `ordenes_servicio_tecnicos` | Acompañantes de una orden: técnicos que van con el responsable (`ordenes_servicio.tecnico_id`); la ven en su agenda y les ocupa el horario |

## Etapa 6 y 7: fiscal, informes y contabilidad

| Tabla | Para qué |
|---|---|
| `presentaciones` | Libros y declaraciones generados (Libro IVA Digital, SICORE), con el archivo exacto, el estado (generada, presentada, reabierta), el número de transacción y la secuencia de rectificativa. Presentada, cierra el período para ese impuesto. Ver [05-impuestos-e-informes.md](05-impuestos-e-informes.md) |
| `configuracion_contable`, `ejercicios` | Puesta en marcha (desde qué fecha se contabiliza), fecha hasta la que no se aceptan asientos y ejercicios abiertos o cerrados |
| `cuentas_contables`, `imputaciones_contables` | Plan de cuentas (código con puntos, imputable o de agrupación) y cuentas clave: a qué cuenta va cada cosa en los asientos automáticos (también por proveedor, caja o concepto) |
| `asientos`, `asientos_lineas` | Asientos automáticos (uno vigente por operación) y manuales; se anulan con contraasiento. Partida doble controlada en la base. Ver [06-contabilidad.md](06-contabilidad.md) |
