---
name: erp-circuitos
description: Circuitos operativos y contables del ERP y cómo se encadenan — presupuesto → pedido → remito → factura → cobranza; compra → orden de pago con retenciones; cuentas corrientes e imputaciones; tesorería (cajas, bancos, cheques/ECHEQ, cierres de caja por turno, vales, conciliación); stock por movimientos; y asientos contables automáticos. Usala cuando un cambio afecte saldos, deudas, stock, caja, cheques o asientos; al agregar un tipo de operación que mueva plata, mercadería o deba contabilizarse; al implementar una anulación; o para explicar por qué un saldo o un informe da lo que da.
---

# Circuitos: plata, mercadería y asientos

## Principio: nada guarda un saldo
Los saldos **se calculan a partir de los movimientos** (docs/01 §6). Así el saldo y su historia nunca se contradicen.

| Saldo | Se calcula como | Dónde |
|---|---|---|
| Stock por artículo y depósito | Σ `movimientos_stock` | `comercial/stock.ts` (`registrarMovimientos`, `saldos`) |
| Deuda de un comprobante de venta | total en pesos − imputado (recibos no anulados + NC) | `facturacion/cuentas.ts` (`enPesos`, `imputaciones`) |
| Cuenta corriente de proveedor | por **moneda** (lo de dólares se cancela en dólares) | `compras/cuentas.ts` |
| Cuenta de tesorería (caja/banco) | recibos emitidos + pagos emitidos + movimientos de tesorería | `tesoreria/cuentas.ts` (`saldosCuentas`, `libro`) |
| Estado de un cheque de terceros | lo que se hizo con él: en cartera, entregado, depositado, canjeado, rechazado | `tesoreria/cheques.ts` |
| Libros contables | Σ asientos registrados (los anulados por contraasiento se compensan) | `contabilidad/libros.ts` |

Si por rendimiento hiciera falta guardar un saldo: recalcularlo en la misma transacción del movimiento y agregar
una prueba que verifique que coincide con la suma.

## Ventas
1. **Presupuesto → pedido** (`comercial/documentos.ts`): documentos sin valor fiscal, con renglones, moneda y
   cotización. Un presupuesto aceptado se convierte en pedido. Cálculo de totales en `comercial/calculo.ts`.
2. **Remito** (`comercial/remitos.ts`): entrega mercadería → **descuenta stock** del depósito y actualiza lo
   entregado del pedido (entregas parciales). No se modifica: se anula, y la anulación **devuelve el stock**.
   COT de ARBA si viaja por PBA (`comercial/cot.ts`).
3. **Factura** (`facturacion/comprobantes.ts`, skill `erp-fiscal-arca`): borrador → CAE. Puede venir de un pedido
   (`pedido_id`), de contratos (`contratos/facturacion.ts`), de servicio técnico con cargo, de tiendas online
   (`tiendas/facturar.ts`) o de intereses por mora (`facturacion/cobranza.ts` → ND en borrador).
4. **Cobranza** (`facturacion/cuentas.ts`): recibo numerado (`siguienteNumero`) con valores por medio de cobro
   (efectivo, transferencia, cheques, tarjeta, retenciones sufridas) que entran a una cuenta de tesorería
   (`resolverCuenta`: la elegida o la predeterminada del medio). Se **imputa** a comprobantes; lo que sobra queda a
   cuenta. Efectivo con caja por turnos: `cajaCerrada` impide mover sin turno abierto (`tesoreria/cierres.ts`).
5. **Cobranza automática** (`facturacion/cobranza.ts`): recordatorios escalonados por etapas, estado de deuda (PDF y
   enlace firmado) e intereses por mora. **Cobros online** (`cobros/`): links de pago; el pago se confirma
   consultando a la pasarela, nunca por la redirección del navegador.

## Compras y pagos
1. **Orden de compra** (`compras/ordenes.ts`) → se recibe con comprobantes de compra, parcial o total.
2. **Comprobante de compra** (`compras/compras.ts`): tal cual lo emitió el proveedor; con artículos **entra stock**;
   sin artículos (gastos, servicios) se cargan bases por alícuota. IVA crédito y percepciones sufridas como tributos.
3. **Orden de pago** (`compras/pagos.ts`): cancela comprobantes en su moneda, lo que sobra queda a cuenta. Calcula
   **retención de Ganancias** (RG 830) e IIBB según padrón; lo retenido también cancela deuda y genera certificado.
   Paga con valores: efectivo, transferencia, cheques propios (diferidos) o endoso de cheques de terceros.
4. **Reposición** (`comercial/reposicion.ts`): faltantes bajo el mínimo (contando lo pedido) → órdenes de compra por proveedor.

## Tesorería
- Cuentas: cajas, bancos, billeteras, cartera de valores (`tesoreria/cuentas.ts`).
- Movimientos varios, transferencias entre cuentas, acreditación de cupones, arqueos (`tesoreria/movimientos.ts`).
- Cierre de caja estilo POS por turno con reporte "Z" en PDF (`tesoreria/cierres.ts`, `reporteCierre.ts`); diferencias
  mayores a la tolerancia exigen `ventas.supervisar_caja`.
- Vales a rendir (`tesoreria/vales.ts`), conciliación bancaria por extracto CSV/Excel con sugerencias (`conciliacion.ts`).
- Cheque rechazado: la deuda vuelve al cliente/proveedor con una **nota de débito interna** (tipo 99, sin ARCA).

## Contabilidad automática (`src/modulos/contabilidad/`)
- `automaticos.ts`: cada operación desde la fecha de inicio de la contabilidad genera **su** asiento y cada anulación
  su **contraasiento**. Es **idempotente** (una operación = un asiento vigente, identificado por `origen` + `origen_id`):
  corre al abrir la contabilidad, desde la tarea programada o a mano, y hace solo lo que falta.
- Orígenes (`type Origen` en `asientos.ts`): manual, venta, compra, cobranza, pago, cheque_propio, tesoreria,
  cheque_rechazado, liquidacion_iva, refundicion, apertura.
- Esquemas: Factura/ND = Deudores a Ventas + IVA débito + percepciones; Compra = Mercaderías/gasto + IVA crédito +
  percepciones sufridas a Proveedores; Cobranza = Caja/banco/valores/retenciones a Deudores; Pago = Proveedores a
  Caja/banco/cheques/retenciones a depositar; NC = al revés.
- `Partida` arma las líneas **en centavos** y manda la diferencia de redondeo de cotización a "Diferencias de
  redondeo" (si supera un umbral, falla: los importes no cierran). `registrarAsiento` controla partida doble,
  cuentas imputables y período abierto.
- Cuentas por **clave** (`plan.ts`: `mapaDeCuentas`, `configuracionContableDe`): el contador puede cambiar el plan; el
  código nunca usa ids ni códigos de cuenta fijos. Falta una cuenta clave → error claro, no asiento incompleto.
- `cierre.ts`: liquidación de IVA al presentar el libro, refundición de resultados y apertura del ejercicio.

### Agregar una operación que se contabiliza
1. Nuevo valor en `Origen` (y en la base si hay un check/enum).
2. En `contabilizar`: consulta de pendientes con `SIN_ASIENTO(origen, columna)` y de anuladas con
   `CON_ASIENTO_SIN_REVERSA`; armado con `Partida` usando claves de cuenta (agregá la clave al plan modelo si es nueva).
3. Pruebas en `automaticos.test.ts`: genera, no duplica al correr dos veces, revierte al anular, cuadra al centavo.
4. `pendientesDeContabilizar` debe contarla para el aviso en pantalla.

## Anular, nunca borrar
Toda operación con efecto (stock, deuda, fondos, fiscal) se anula: `estado: 'anulado'` + revertir sus efectos en la
misma transacción (devolver stock, liberar imputaciones, contramovimiento) + `auditar(... 'anulacion' ...)`; el
asiento se revierte solo en la próxima corrida de `contabilizar`. Controlar `controlarBloqueo` con la fecha de la
operación original. Los comprobantes fiscales se corrigen con NC/ND.

## Multimoneda
Cada documento guarda moneda y cotización de su fecha. Clientes: cuenta corriente en pesos (`enPesos`). Proveedores:
una cuenta por moneda. Informes de gestión: en pesos, neto de IVA (`informes/gestion.ts`).

## Checklist
- [ ] Ningún saldo guardado nuevo (o recalculado en la misma tx + prueba de consistencia)
- [ ] Movimientos de stock/fondos e imputaciones en la misma transacción que la operación
- [ ] Anulación revierte todos los efectos y respeta bloqueos de período
- [ ] Si es contabilizable: `Origen`, `contabilizar`, claves de cuenta y pruebas de idempotencia y reversa
- [ ] Pruebas con montos exactos (strings) y, si aplica, en otra moneda
