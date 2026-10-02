# Etapa 7: contabilidad

Función "Informes, impuestos y contabilidad" del plan (Pyme y Empresa). Permisos:

- `contabilidad.ver`: plan de cuentas, asientos y libros.
- `contabilidad.asientos`: contabilizar, asientos manuales y reclasificaciones.
- `contabilidad.configurar`: puesta en marcha, plan de cuentas, cuentas clave, bloqueo de fechas y cierre de ejercicio.

El rol de sistema **Contador** tiene los tres.

La idea es que el contador no cargue lo que ya está en el sistema. Cada operación genera su asiento sola; el contador revisa los controles, reclasifica lo que haga falta, carga lo que no sale de una operación (amortizaciones, sueldos, ajustes) y cierra.

## Puesta en marcha (`/contabilidad`)

Se elige la fecha desde la que se contabiliza y el cierre del primer ejercicio. Se crea:

- un plan de cuentas modelo para pyme comercial y de servicios (`src/modulos/contabilidad/plan.ts`), que se puede cambiar;
- las **cuentas clave**, que dicen a qué cuenta va cada cosa en los asientos automáticos (deudores, proveedores, IVA débito y crédito, percepciones y retenciones, ventas, gastos a imputar, redondeo…);
- una cuenta por cada caja, banco o billetera de tesorería (las tarjetas de crédito de la empresa van al pasivo); las que se creen después se agregan solas;
- el primer ejercicio. Los siguientes se abren solos con el primer asiento posterior.

Lo anterior a la fecha de inicio se carga con un **asiento manual de apertura** con los saldos del último balance.

## Asientos automáticos

`contabilizar()` (`automaticos.ts`) corre cada hora desde la tarea programada (`/api/cron/servicio`), al poner en marcha y con el botón "Contabilizar ahora". Es idempotente: cada operación tiene un solo asiento vigente (índice único por origen y operación). Las anulaciones generan su **contraasiento**, con la fecha de la anulación.

| Operación | Asiento |
|---|---|
| Factura / ND de venta | Deudores (con el cliente) a Ventas de mercaderías o de servicios (según el concepto), IVA débito fiscal, percepciones a depositar (IIBB 2, 5, 7; IVA 6, 13; el resto a "otros impuestos") |
| NC de venta | Al revés |
| ND interna por cheque rechazado | Deudores a Cheques rechazados (y recupero de gastos bancarios) |
| Compra | Mercaderías (la parte de artículos con stock) o la cuenta de gasto del proveedor (o Gastos a imputar), IVA crédito fiscal, percepciones sufridas, impuestos internos y tasas a Proveedores |
| ND interna del proveedor por cheque rechazado | Cheques rechazados a Proveedores |
| Cobranza | Caja o banco de cada valor (o la predeterminada del medio), Valores a depositar (cheques), Cupones (tarjetas y billeteras), retenciones sufridas a Deudores |
| Orden de pago | Proveedores a Caja o banco, Cheques diferidos a pagar (cheque propio con fecha posterior), Valores a depositar (cheques de terceros entregados), Tarjetas, retenciones a depositar |
| Débito de un cheque propio diferido, al vencer | Cheques diferidos a pagar a Banco |
| Tesorería | La caja o banco contra: Saldos iniciales, la cuenta del concepto (si se asignó), Otros ingresos / Gastos a imputar, Valores a depositar (depósito de cheques), Cheques rechazados, Gastos bancarios (comisiones), Sobrantes / Faltantes (arqueo). Transferencias y acreditaciones de cupones, pata contra pata; si llega menos de lo que sale, la diferencia es comisión |
| Cheque de terceros rechazado que estaba en cartera | Cheques rechazados a Valores a depositar |

- Moneda extranjera: los comprobantes, compras y pagos se pasan a pesos con su cotización; los centavos que deja el redondeo van a "Diferencias de redondeo". Los movimientos de cajas en dólares no tienen cotización: quedan como pendientes para asentar a mano.
- Lo de fechas ya bloqueadas no se asienta: se informa como pendiente.
- Los comprobantes importados de Pymexis no se contabilizan (son historia anterior).

## Liquidación de IVA

Al marcar presentado el Libro IVA se asienta la liquidación del período con la posición guardada: IVA débito fiscal a IVA crédito fiscal, saldo técnico y libre disponibilidad anteriores, percepciones y retenciones de IVA computadas, nuevos saldos a favor e IVA a pagar. Con una rectificativa, la liquidación anterior se revierte y se asienta la nueva. Los períodos presentados antes de poner en marcha la contabilidad se liquidan con "Contabilizar ahora" (o solos con la tarea programada).

## Gastos a imputar por proveedor

Las compras de un proveedor sin cuenta asignada van a "Gastos a imputar". En `/contabilidad` se listan por proveedor: al elegir la cuenta, se reclasifica lo cargado (un asiento por compra, en períodos abiertos) y se recuerda para las próximas compras (`proveedor:<id>` en las cuentas clave). Si después se anula la compra, también se anula su reclasificación.

## Controles

Lo que tiene que cuadrar entre la contabilidad y el resto del sistema, con la causa probable:

- operaciones sin asiento;
- saldo de cada caja y banco contra tesorería (error);
- Valores a depositar contra los cheques en cartera;
- Cheques diferidos a pagar contra los cheques propios sin debitar;
- períodos de IVA presentados sin liquidación;
- cuentas "a imputar" con saldo (gastos, otros créditos, otras deudas, saldos iniciales);
- cuentas clave sin asignar (error).

## Libros (`/contabilidad/libros`)

Libro diario (con número de orden correlativo por fecha), mayor de una cuenta con saldo acumulado, balance de sumas y saldos (los rubros suman a sus subcuentas), estado de resultados (del inicio del ejercicio o del rango, sin la refundición) y situación patrimonial (con el resultado del ejercicio en curso dentro del patrimonio neto mientras no se cierra). Todo exporta a Excel en una planilla.

## Cierre (`/contabilidad/cierre`)

- **Bloquear fechas**: después de revisar un mes, no se aceptan asientos con esa fecha o anterior (`configuracion_contable.cerrado_hasta`).
- **Cerrar ejercicio** (el más antiguo abierto y ya terminado): asienta lo pendiente (si algo falla, no cierra), refunde ingresos y egresos contra Resultado del ejercicio al último día, pasa el resultado a Resultados no asignados el primer día del siguiente, marca el ejercicio cerrado y bloquea sus fechas.

## Integridad en la base

- Partida doble controlada por un trigger diferido (al confirmar la transacción): al menos dos líneas y debe igual a haber.
- Los asientos y sus líneas no se borran ni se modifican: se anulan con un contraasiento.
- Aislamiento por empresa (RLS) como el resto de las tablas.
