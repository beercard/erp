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
