# Cobros online (links de pago)

La empresa conecta sus pasarelas y le manda a su cliente un **link de pago del ERP** (`/pago/<clave>`). El cliente elige con qué pagar y, cuando la pasarela confirma, el ERP **emite el recibo solo** y lo imputa a las facturas. Viene con Facturación.

## Pasarelas

| Pasarela     | Qué carga la empresa                                                   | Cómo se confirma el pago                                                                                         |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Mercado Pago | Access Token de producción (y, opcional, la clave secreta de webhooks) | Aviso a la dirección secreta del pago (firma `x-signature` verificada si hay clave) y consulta a `/v1/payments`. |
| Payway       | Número de comercio (site), clave pública y privada                     | Al volver el cliente y en la revisión periódica, se busca el link en el historial de Payway.                     |
| GoCuotas     | Email y contraseña de la API                                           | Aviso a la dirección secreta del pago, con la referencia del pago (GoCuotas no publica consulta de estado).      |
| Clover       | Merchant ID, token privado de ecommerce y "signing secret" de webhooks | Webhook firmado (`Clover-Signature`) a la dirección de la pasarela y consulta del pago en la API de Clover.      |

- Cada pasarela tiene **modo de prueba** (sandbox), el **medio** con que queda el recibo (Mercado Pago, tarjeta de crédito, débito…) y la **cuenta** de tesorería donde entra la plata.
- Las claves se guardan cifradas con `ERP_CLAVE_MAESTRA`. Al editar, un secreto vacío deja el que estaba; la pantalla nunca los muestra.
- **A validar con cuentas reales:** Payway (el historial de links y si avisa), GoCuotas (estados del aviso) y Clover en Argentina (Fiserv puede usar otra dirección: `CLOVER_API_URL`). Mercado Pago sigue su documentación pública.

## Links de pago

- **Dónde:** Facturación → Links de pago (`/cobros-online`), el botón **Link de pago** en cada factura con saldo y **Pagar** en Mi cuenta del portal de clientes.
- **Por qué importe:** por las facturas elegidas (su saldo), por un importe a cuenta o, sin nada, por todo el saldo del cliente.
- **Cómo se manda:** copiar, WhatsApp (abre el teléfono de quien lo manda con el texto listo) o email (sale por la bandeja de correos de la empresa).
- El link del ERP dura 30 días. El checkout de cada pasarela se arma **cuando el cliente toca "Pagar con…"**, así nunca le llega un checkout vencido.
- Al aprobarse: recibo con el medio y la cuenta de la pasarela, imputado a las facturas del link en orden y hasta su saldo (lo que sobra queda a cuenta). Una sola vez: el pago se bloquea mientras se emite.
- Si el recibo no se puede emitir solo (por ejemplo, la cuenta está inactiva), el link queda **Pagado** con el aviso para cargarlo a mano.

## Seguridad

- El aviso de una pasarela **nunca aprueba un pago por sí solo**: dispara una consulta con las claves de la empresa (salvo GoCuotas, ver arriba).
- Cada pago tiene **dos claves**: la pública del link (la ve el cliente) y una secreta para los avisos (la conoce solo la pasarela). La pública no sirve para avisar.
- Mercado Pago: el pago tiene que traer la `external_reference` del pago del ERP; un aviso de otro pago de la misma cuenta no lo aprueba.
- Tope de 20 intentos por hora y conexión para abrir pagos. Solo se redirige a direcciones `https` de la pasarela.
- RLS por empresa en `pasarelas_pago` y `pagos_online`, con visibilidad por grupos de clientes. `claves_cobro` es de plataforma y solo guarda clave → empresa.
- Permisos: `ventas.cobrar` crea y manda links; `ventas.pasarelas` conecta los medios (Administración lo tiene).

## Tarea periódica

`/api/cron/servicio` vence los links viejos y vuelve a preguntar por los pendientes de Mercado Pago y Payway que ya eligieron pasarela (por si se perdió un aviso).

## Código

- Pasarelas: `src/modulos/cobros/pasarelas.ts`. Lógica: `src/modulos/cobros/cobros.ts`. Pruebas: `cobros.test.ts`.
- Pantallas: `src/app/(app)/cobros-online/`, página pública `src/app/pago/[clave]/`, avisos `src/app/api/cobros/aviso/[clave]/`.

## Cierre de caja (Cobranzas → Cierre de caja)

Inspirado en el cierre de un POS (como el de cobrando.app):

- **Turno abierto** de cada caja (cuenta de tipo caja de Tesorería): desde el último cierre o el comienzo del día.
- **Resumen en vivo:**
  - Cobrado y cantidad de recibos, con promedio.
  - Efectivo esperado: saldo inicial + entradas − salidas de la caja.
  - Ventas facturadas y recibos anulados.
  - Cobrado por medio de pago y por cajero, y cobros online acreditados.
  - Retiros, gastos y otros movimientos de la caja.
- **Cierre:** conteo por billete y moneda (o el total), con la diferencia en el momento ("Cuadra", "Sobran", "Faltan") y observaciones. Si no cuadra, queda un **arqueo con su ajuste** y la caja sigue con lo contado. El próximo turno arranca desde ese cierre.
- **Historial** de cierres con su diferencia, detalle imprimible y **Excel** (un cierre con sus hojas, o la lista de cierres de la caja).
- Ver: `ventas.ver`. Cerrar: `ventas.cobrar`. Código: `src/modulos/tesoreria/cierres.ts` y `src/app/(app)/cobranzas/caja/`.

### Caja por turnos (como un punto de venta)

En Cobranzas → Cierre de caja → Configuración de la caja (permiso `ventas.supervisar_caja`):

- **Trabajar por turnos:** la caja se **abre** contando el fondo inicial (billetes o total) con una nota opcional. Si no coincide con lo que quedó del cierre anterior, queda un arqueo con su ajuste. Con la caja cerrada no se cobra, no se paga, no se da un vale ni se registra un movimiento en efectivo por ella.
- Los **recibos quedan en el turno**: el de la caja donde entró el efectivo o, si el cobro no pasó por una caja (transferencia, tarjeta), el turno que abrió quien cobra. El resumen del turno muestra esas cobranzas.
- **Arqueo de los demás medios:** al cerrar, además del efectivo, el cajero rinde lo de cada medio (cupones, comprobantes de transferencia, cheques) con "Copiar lo esperado". Las diferencias quedan en el cierre; solo el efectivo genera ajuste.
- **Diferencia máxima:** si el efectivo o algún medio difiere más que eso, el cajero no puede cerrar; lo cierra alguien con `ventas.supervisar_caja`, y queda quién aprobó.
- Las cajas que no trabajan por turnos siguen como antes (del último cierre o del comienzo del día).

### Reporte del cierre (tipo "Z")

- PDF con el turno, el efectivo (fondo, esperado, contado, diferencia), cobranzas por medio y cajero, otros medios rendidos, cobros online, ventas, movimientos, conteo y notas. Botón **PDF** en el detalle del cierre.
- **Envío automático** al cerrar, a los correos (con el PDF adjunto) y celulares (resumen por WhatsApp con un enlace firmado al reporte, válido 90 días) que se configuran en la caja. Lo que salió y lo que no queda en el cierre. Sin correo saliente configurado, el correo queda en la bandeja de salida; sin WhatsApp conectado, se avisa.
- Código: `src/modulos/tesoreria/reporteCierre.ts`, `src/lib/pdf.ts` (PDF de texto sin dependencias), página pública `src/app/cierre/[token]/`.

## Vales a rendir (Tesorería → Vales a rendir)

- Plata que sale de una caja para una persona (compras chicas, viáticos, trámites), numerada. Sale de la caja en el momento.
- **Rendición:** se cargan los gastos (concepto, importe, comprobante). Lo que sobró vuelve a la caja; si gastó de más, se le reintegra. Los gastos rendidos del mes se ven por concepto con su porcentaje.
- Un vale sin rendir se anula y la plata vuelve. Permiso `tesoreria.mover`. Código: `src/modulos/tesoreria/vales.ts`.

## Canje de cheques (Tesorería → Cheques → Canjear por fondos)

- Cheques de la cartera que se cambian por efectivo o transferencia (financiera, mutual, otro comercio). Entra el importe de cada cheque en la caja, banco o billetera elegida y sale el **costo del canje** (la diferencia con lo recibido) como gasto.
- El cheque queda **Canjeado**. "Deshacer canje" anula el canje entero. Si rebota, se debita de la cuenta donde entró y vuelve la deuda del cliente, como un depositado.

## Cierre de períodos por módulo (Configuración → Cierre de períodos)

- Ventas y cobranzas, Compras y pagos, y Tesorería se cierran **hasta una fecha** (permiso `empresa.bloqueos`): nada con fecha hasta ese día se emite, carga ni anula (facturas, recibos, compras, órdenes de pago, movimientos, depósitos, rechazos, canjes, arqueos y vales).
- Se reabre corriendo la fecha para atrás o con "Reabrir". Es aparte del cierre de períodos de IVA presentados y del cierre del ejercicio contable. Código: `src/modulos/empresa/bloqueos.ts`.

## Cobranza automática (Cobranzas → Cobranza automática)

- **Estado de cuenta** de cada cliente: comprobantes con saldo, vencimiento (el del comprobante o el de la condición de pago), días vencido, vencido, a vencer y total. En PDF desde la cuenta corriente, con un botón para **mandarlo** por correo (con el PDF) y por WhatsApp (con un enlace firmado al estado de cuenta, válido 30 días). También "Mandar el estado de cuenta a todos" los que tienen deuda vencida.
- **Recordatorios solos** (una vuelta por día desde las 9): un aviso unos días antes del vencimiento y recordatorios después (por defecto a 1, 7, 15 y 30 días); desde los 15 días, con tono de reclamo. Cada comprobante recibe cada etapa una sola vez por medio. Por correo, por WhatsApp o los dos.
- **Intereses por mora**: tasa mensual simple por día sobre el saldo vencido, con días de gracia y un mínimo. La pantalla muestra lo que corresponde a hoy por cliente y arma una **nota de débito en borrador** por cliente (asociada a la factura más vieja, un renglón por comprobante); se revisa y se autoriza como cualquier nota. El próximo cálculo arranca al día siguiente de lo ya cobrado.
- Código: `src/modulos/facturacion/cobranza.ts`; página pública `src/app/deuda/[token]/`.

## Tiendas online que facturan solas

En la configuración de cada tienda, **Facturar solo los pedidos pagados**: cada pedido pagado que entra se **remite** (descuenta stock), se **factura y autoriza en ARCA** y se **cobra** con un recibo en la cuenta elegida (Mercado Pago, la pasarela). Lo que no se pueda hacer (sin punto de venta, ARCA caída, sin stock con series) queda anotado en el pedido de la tienda para terminarlo a mano. Corre con la tarea periódica. Código: `src/modulos/tiendas/facturar.ts`.
