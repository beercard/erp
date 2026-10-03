# Códigos de ARCA usados por el ERP

Fuente: catálogos globales de `drizzle/0002_catalogos_fiscales.sql` (solo lectura para `erp_app`) y
`src/modulos/facturacion/tipos.ts`. Si ARCA agrega un código, va en una migración nueva, no en el código.

## Tipos de comprobante (WSFEv1)

| Clase | A | B | C | FCE MiPyME A | FCE B | FCE C | A sujeta a retención (RG 5762) |
|---|---|---|---|---|---|---|---|
| Factura | 1 | 6 | 11 | 201 | 206 | 211 | 51 |
| Nota de débito | 2 | 7 | 12 | 202 | 207 | 212 | 52 |
| Nota de crédito | 3 | 8 | 13 | 203 | 208 | 213 | 53 |

Internos (no van a ARCA): `99` nota de débito interna, `0` saldo inicial migrado.
Comprobantes **recibidos** pueden traer otros códigos (M, etc.): ver `src/modulos/compras/tipos.ts`.

## Condiciones frente al IVA (receptor, RG 5616) — tabla `condiciones_iva`

| Código | Nombre | Letra si emite un RI |
|---|---|---|
| 1 | IVA Responsable Inscripto | A |
| 4 | IVA Sujeto Exento | B |
| 5 | Consumidor Final | B |
| 6 | Responsable Monotributo | A |
| 7 | Sujeto No Categorizado | B |
| 8 | Proveedor del Exterior | B |
| 9 | Cliente del Exterior | E (exportación: no la emite este WSFE) |
| 10 | IVA Liberado – Ley N° 19.640 | B |
| 13 | Monotributista Social | A |
| 15 | IVA No Alcanzado | B |
| 16 | Monotributo Trabajador Independiente Promovido | A |

Emisor no RI (exento, monotributo) → siempre **C** (`letraPara`).

## Tipos de documento — tabla `tipos_documento`

80 CUIT · 86 CUIL · 87 CDI · 89 LE · 90 LC · 91 Cédula extranjera · 94 Pasaporte · 96 DNI · 99 Sin identificar
(consumidor final: `docTipo 99`, `docNumero '0'`).

## Alícuotas de IVA — tabla `alicuotas_iva` y `TASAS_IVA`

| Código | % |
|---|---|
| 3 | 0 |
| 4 | 10,5 |
| 5 | 21 |
| 6 | 27 |
| 8 | 5 |
| 9 | 2,5 |

## Monedas — tabla `monedas`

`PES` (ARS, $) · `DOL` (USD, US$) · `060` (EUR, €). La cotización se guarda por comprobante (`numeric(18,6)`).

## Conceptos (WSFE)

1 Productos · 2 Servicios · 3 Productos y servicios. Tolerancia de fecha del comprobante: 5 días (concepto 1) y
10 días (2 y 3) — `rangoFecha`. Con servicios ARCA pide período facturado y vencimiento de pago.

## Redondeo

- Importes en general: half-up a 2 decimales (`aImporte`).
- IVA por alícuota informado a ARCA: half-even (`aImporteArca`): 0,125 → 0,12; 0,135 → 0,14.
