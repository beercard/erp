# Etapa 6: impuestos e informes

Función "Informes e impuestos" del plan (Pyme y Empresa). Permisos: `impuestos.libros` (IVA, IIBB, retenciones y presentaciones) e `informes.ver` (informes de gestión).

## IVA (`/impuestos/iva`)

- **Posición del mes**: débito fiscal (ventas autorizadas del mes, por fecha) contra crédito fiscal (compras registradas con ese período de IVA; solo A y M computan), percepciones de IVA sufridas en compras y retenciones de IVA que descontaron los clientes. No incluye saldos a favor de meses anteriores: los suma el contador en el F.2002.
- **Libro IVA Digital** (RG 4597): un .zip con los cuatro archivos para importar en Portal IVA:
  - `LIBRO_IVA_DIGITAL_VENTAS_CBTE_AAAAMM.txt` (266 caracteres por línea) y `..._VENTAS_ALICUOTAS_...` (62).
  - `LIBRO_IVA_DIGITAL_COMPRAS_CBTE_AAAAMM.txt` (325) y `..._COMPRAS_ALICUOTAS_...` (84).
  - Ancho fijo, importes con 2 decimales implícitos, textos sin acentos en mayúsculas, CRLF. Importes en la moneda del comprobante con su tipo de cambio.
  - Ventas A y B informan alícuotas (un exento va con una de 0 % en cero); compras solo A y M (B y C no dan crédito fiscal).
  - Tributos de ventas por código de ARCA: nacionales (1, 6, 9), IIBB (2, 5, 7), municipales (3, 8), internos (4), no categorizados (13); el resto va en "otros tributos".
  - Advertencias antes de presentar: factura A sin CUIT, proveedor sin CUIT.
- **Subdiarios** de IVA ventas y compras en Excel (en pesos; notas de crédito en negativo).
- **Arrastre de saldos** (como el F.2002): el saldo técnico a favor y el de libre disponibilidad salen de la presentación del mes anterior; si ese mes no se presentó desde el sistema, se cargan a mano (`saldos_iva`). La pantalla muestra lo que pasa al mes siguiente.
- **Controles antes de presentar**, con enlace a cada comprobante. Errores: ventas sin confirmar con ARCA, factura A con CUIT inválido, moneda extranjera sin cotización, proveedor sin CUIT válido, compra con fecha posterior al período. Avisos: borradores del mes, notas sin comprobante asociado, huecos de numeración (también contra el último número del mes anterior), compras de más de un año, letra que no coincide con la condición de IVA del proveedor, A sin IVA, percepción de IIBB sin jurisdicción, compras del mes cargadas para un período posterior.
- **Cruce con Mis Comprobantes Recibidos** de ARCA (el Excel, CSV o ZIP que baja ARCA): coinciden, faltan cargar (con el crédito fiscal que se pierde y un botón para registrarlos), diferencias de total o IVA, cargados en otro período y cargados que ARCA no informa.
- Al marcar presentado, el libro se vuelve a generar y se compara con el archivo bajado: si cambió algo, pide bajarlo de nuevo.

## Presentaciones y cierre del período

Cada descarga queda en `presentaciones` con el archivo exacto. Al marcarla presentada (con el número de transacción de ARCA) el período queda cerrado para ese impuesto:

- Libro IVA: no se registran ni anulan compras de ese período de IVA, ni se autorizan comprobantes de venta con fecha en ese mes.
- Para corregir se reabre con un motivo (queda en la auditoría) y la siguiente descarga es la rectificativa (secuencia 1, 2…).
- Lo presentado no se borra (la base no lo permite).

## Vencimientos (`/impuestos/vencimientos`)

- Obligaciones con vencimiento mensual: arranca con IVA, SICORE e IIBB con días aproximados según la terminación del CUIT (el calendario oficial cambia cada año: cada fecha se corrige con un clic) y se pueden sumar otras (autónomos, cargas sociales…).
- El vencimiento es el día del mes siguiente al período; si cae sábado o domingo pasa al lunes (los feriados no se calculan: se corrige la fecha).
- IVA y SICORE quedan presentados solos cuando el período se marca presentado; IIBB y las demás se marcan cumplidas a mano.
- La tarea programada (`POST /api/cron/servicio`) crea los vencimientos y manda un email unos días antes de cada uno que no esté presentado, y otro si se pasó la fecha. Cada aviso sale una vez.

## Paquete para el contador

- Un .zip con el Libro IVA Digital (el archivo presentado, si ya está), los subdiarios, IIBB, retenciones, SICORE y un `LEEME.txt` con la posición de IVA, los saldos que pasan al mes siguiente y los controles pendientes.
- Se baja desde IVA o se manda adjunto al email del contador. Si está configurado, sale solo al marcar presentado el Libro IVA.
- Rol de sistema **Contador**: ve todas las operaciones, genera libros, presentaciones e informes, y no carga ni modifica nada. Se le da al estudio desde Configuración › Usuarios.

## Ingresos Brutos (`/impuestos/iibb`)

- Ventas netas del mes por provincia del cliente, con su porcentaje: ayuda para el Convenio Multilateral (el coeficiente unificado lo define el contador).
- Percepciones de IIBB cobradas como agente, por jurisdicción y con el detalle por comprobante.
- Percepciones de IIBB sufridas en compras (por jurisdicción) y retenciones de IIBB que descontaron los clientes.
- Excel con todo el detalle.

## Retenciones (`/impuestos/retenciones`)

- Practicadas en los pagos a proveedores (Ganancias, IIBB, IVA, SUSS), con su certificado.
- **SICORE**: archivo de importación de las retenciones de Ganancias (impuesto 217), 144 caracteres por línea: comprobante 06 (orden de pago), fecha, número y total del pago, régimen, base, fecha, condición (01 inscripto, 02 no inscripto), importe retenido, documento del retenido y número de certificado. Importes con coma decimal. Queda como presentación con cierre del período.
- Sufridas: retenciones en cobranzas y percepciones de IVA y Ganancias en compras.

## Informes de gestión (`/informes`)

Ventas netas (sin IVA, en pesos, notas de crédito restando) del rango: resumen, los 12 meses, clientes, artículos y vendedores; compras por proveedor. Todo a Excel.

## Pendiente

- Archivos de importación para SIFERE (percepciones y retenciones de IIBB sufridas) y para los agentes provinciales (ARBA, AGIP): los formatos cambian por jurisdicción; hoy el detalle sale en Excel.
- SIRE (retenciones de IVA y SUSS) y prorrateo del crédito fiscal.
- Etapa 7: contabilidad (plan de cuentas y asientos automáticos).

## Padrón de ARCA por CUIT

En la ficha de un cliente o proveedor, **Completar desde ARCA** trae de la constancia de inscripción la razón social (o apellido y nombre), la condición frente al IVA (inscripto, exento, monotributo o sin inscripción), el domicilio fiscal y la provincia, y avisa si el CUIT está inactivo.

- Servicio de ARCA `ws_sr_constancia_inscripcion` (`getPersona_v2`), con el mismo certificado de la empresa. Hay que **asociarlo** en ARCA: Administrador de relaciones de clave fiscal → nueva relación → ese servicio (además del de factura electrónica).
- Código: `src/modulos/arca/padron.ts`.

## Comprobantes A de la RG 5762/2025

Desde el 1/12/2025 no hay factura M. En Configuración → ARCA se elige cómo emite la empresa sus A, según lo que le asignó ARCA:

| Régimen                     | Código                         | Leyenda impresa                    |
| --------------------------- | ------------------------------ | ---------------------------------- |
| A común                     | 1, 2, 3                        | —                                  |
| A sujeta a retención        | 51, 52, 53 (los de la vieja M) | OPERACIÓN SUJETA A RETENCIÓN       |
| A con pago en CBU informada | 1, 2, 3                        | PAGO EN CBU INFORMADA (con la CBU) |

- Con leyenda hace falta cargar la **CBU informada**. Las notas de crédito y débito siguen siempre a su factura, aunque después cambie el régimen.
- **En compras**, los comprobantes 51 a 53 se muestran como "A sujeta a retención" (FA-R): al pagarlos, el sistema avisa que corresponde retener el 100 % del IVA y el 6 % de Ganancias sobre el neto y pagar en la CBU informada del proveedor.

## Mis Comprobantes: recordatorio mensual

ARCA no ofrece un servicio web para bajar los comprobantes recibidos, así que el calendario de vencimientos trae una obligación más: **"Mis Comprobantes de ARCA: bajar y cruzar las compras del mes"**, una semana antes del IVA, con el mismo aviso por correo que los demás vencimientos. Se cruza en Compras → Importar → Mis Comprobantes. Se puede desactivar o cambiar de día como cualquier obligación.

## Facturas recibidas en un clic

La IA, además de leer, dice qué tan segura está de la lectura. Si la confianza es **alta**, el comprobante tiene CAE y **todos los controles dan bien** (CUIT válido, hecho a la empresa, fecha, tipo e importes que cierran), la factura queda "Verificada" y se registra con un botón, o todas juntas con "Registrar las N". Si algo no cierra, hay que abrirla y revisarla como antes. Al registrar en un clic se vuelven a correr los controles.

## Reposición de stock (Stock → Reposición)

- Muestra los artículos con stock mínimo que, **contando lo ya pedido en órdenes de compra sin recibir**, quedaron por debajo.
- Sugiere pedir el **lote de reposición** del artículo o, si no tiene, **hasta el doble del mínimo** (nunca menos de lo que falta), al **proveedor habitual** o, si no tiene, al de la última compra, con el último precio de compra.
- Con los marcados arma **una orden de compra por proveedor**; las cantidades se pueden cambiar antes. En la ficha del artículo se cargan el lote y el proveedor habitual. La página de Stock avisa cuando hay algo por reponer.

## Resumen para el dueño (Configuración → Resumen para el dueño)

- Un mensaje por **correo y/o WhatsApp**, **todos los días** (lo del día anterior) o **una vez por semana** (los últimos 7 días, el día elegido). Sale desde las 7 con la tarea periódica, nunca dos veces el mismo día.
- Trae ventas (netas y con IVA, en pesos), cobranzas, deuda vencida de clientes con los tres mayores deudores, saldos de caja y de bancos y billeteras, y **para mirar**: vencimientos impositivos de la semana (o ya vencidos), cheques en cartera para depositar en 7 días, cierres de caja con diferencia, artículos bajo el mínimo y facturas de proveedores recibidas sin registrar.
- La pantalla muestra cómo llegaría hoy y tiene "Guardar y mandar ahora" para probarlo.
