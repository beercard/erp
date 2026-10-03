---
name: erp-fiscal-arca
description: Reglas fiscales argentinas tal como las implementa el ERP — facturación electrónica con ARCA (ex AFIP: WSAA, WSFEv1, CAE, verificación de pendientes, homologación/producción, ARCA simulado), tipos y letras de comprobante (A/B/C, FCE MiPyME, RG 5762), IVA por alícuota y su redondeo, tributos y percepciones, retenciones (Ganancias RG 830, IIBB con padrones, ARBA y COT), CUIT, Libro IVA Digital, presentaciones y cierre de períodos. Usala siempre que el trabajo toque comprobantes de venta o de compra, notas de crédito/débito, impuestos, códigos de ARCA, cálculos de IVA o cualquier pedido que mencione AFIP, ARCA, CAE, factura A/B/C, monotributo, responsable inscripto, IIBB, percepciones, retenciones o libro IVA.
---

# Fiscal argentino y ARCA

Todo cálculo fiscal o de dinero lleva prueba (docs/01 §1) y un comentario con la norma (RG/ley) que lo justifica.
Detalle funcional en `docs/05-impuestos-e-informes.md`; tablas de códigos en [references/codigos-arca.md](references/codigos-arca.md).

## Comprobantes de venta: ciclo de vida (`src/modulos/facturacion/comprobantes.ts`)

```
borrador ──emitir──▶ pendiente_verificacion ──CAE──▶ autorizado ──(NC o anulación interna)
   ▲                         │
   └──── rechazo de ARCA ────┘   (ErrorIncierto: queda pendiente → verificarComprobante)
```

- **Un comprobante autorizado es inmutable** — hay trigger en la base: ni la app puede hacer UPDATE/DELETE. Se corrige
  con nota de crédito/débito. Solo un `borrador` se edita o elimina (`eliminarBorrador`).
- **El número lo da ARCA**: `ultimoAutorizado(pv, tipo) + 1`, con el numerador local bloqueado (`bloquearNumerador`)
  mientras se pide. El numerador `arca-<tipo>` se actualiza con `greatest(...)` al autorizar.
- **Tres transacciones** en `emitirComprobante`: (1) controlar y reservar → `pendiente_verificacion`; (2) pedir el CAE
  **sin transacción abierta**; (3) guardar respuesta. Si ARCA no responde (`ErrorIncierto`), el comprobante queda
  pendiente y `verificarComprobante` consulta a ARCA si lo autorizó. Si rechaza, vuelve a `borrador` sin consumir número.
  Copiá este patrón para cualquier servicio externo con efecto fiscal.
- Antes de emitir se controla: límite del plan (`controlarLimite(empresaId, 'comprobantesMes')`), período cerrado
  (`controlarBloqueo(tx, 'ventas', fecha)`), IVA del mes ya presentado (`controlarPeriodoIva`), datos del receptor
  releídos de la ficha (pueden haber cambiado desde el borrador) y `controlar(...)` (tolerancia de fecha
  `rangoFecha(concepto)`: 5 días productos, 10 servicios).
- Después de autorizar: `auditar(... 'emision' ...)` y `aplicarNota` (una NC/ND se imputa a su comprobante asociado).
- El PDF se genera después del CAE y se puede regenerar siempre. QR según RG 4291: `urlQr` en `tipos.ts`.

## Letra y tipo (`src/modulos/facturacion/tipos.ts`, sin base: lo usan pantallas y pruebas)
- `letraPara(condicionEmisor, letraDesdeInscripto)`: emisor RI (condición 1) → A o B según
  `condiciones_iva.letra_desde_inscripto` del receptor; emisor Exento/Monotributo → **C**.
- `codigoComprobante(letra, clase, fce, sujetaRetencion)` y su inversa `datosTipo(tipo)`;
  `nombreComprobante`, `abreviatura` (FA, NCB, FCEA…). No escribas códigos numéricos sueltos en el código.
- **RG 5762/2025**: los A de emisores observados van con códigos 51-53 y leyenda "OPERACIÓN SUJETA A RETENCIÓN"
  (o "PAGO EN CBU INFORMADA"); el régimen de la empresa está en `REGIMENES_CLASE_A`.
- Especiales internos: tipo `99` = nota de débito interna sin valor fiscal (cheque rechazado; no pasa por ARCA);
  tipo `0` = saldo inicial migrado.
- Receptor sin documento válido → consumidor final `docTipo 99, docNumero '0'` (`documentoReceptor`).

## IVA y totales (`src/modulos/comercial/calculo.ts`)
- Neto del renglón = cantidad × precio × (1 − descuento%), a centavos.
- El IVA se calcula **por alícuota sobre la suma de netos de esa alícuota** y se redondea **una sola vez, al par**
  (`aImporteArca`, ROUND_HALF_EVEN, como pide ARCA). El IVA por renglón es solo informativo.
- `TASAS_IVA` por código de ARCA: 3→0, 4→10,5, 5→21, 6→27, 8→5, 9→2,5.
- En los **C** no se discrimina IVA: el precio es final.
- Impuestos = **renglones** (alícuota, base, importe) en tablas `*_tributos`, nunca columnas fijas por impuesto.
- Cada comprobante guarda **moneda y cotización** (`PES`, `DOL`, `060`); la cuenta corriente de clientes va en pesos
  (`enPesos`). Cotización vigente: `comercial/cotizacion.ts`.

## ARCA técnico (`src/modulos/arca/`)
- `certificado.ts`: clave privada cifrada AES-256-GCM con `ERP_CLAVE_MAESTRA` (fuera de la base). Nunca loguear ni
  devolver la clave o el certificado.
- `wsaa.ts` firma el TRA (CMS) y obtiene token+firma; `credenciales()` los cachea en `arca_tickets` por ambiente y
  servicio. El error "ya posee un TA" significa que otro sistema pidió ticket con el mismo certificado: esperar.
- `wsfe.ts`: el **orden de los elementos XML importa** (esquema de ARCA). `soap.ts` separa el transporte.
- `ClienteArca` es la interfaz que usa la facturación; las pruebas usan `ArcaFalso` (en `facturacion/facturacion.test.ts`):
  numera, aprueba, rechaza o simula cortes (`incierto`, `incierto_pero_autoriza`). **Nunca** llames a ARCA real en pruebas.
- `ARCA_SIMULADO=1` (solo fuera de producción): autoriza todo con CAE inventado; lo usan la demo y Playwright.
- Ambiente por empresa en `arca_configuracion.ambiente`: `homologacion` | `produccion`.
- `padron.ts`: constancia de inscripción por CUIT (completa la ficha del cliente).

## Compras (`src/modulos/compras/`)
- Se registran **como los emitió el proveedor** (`compras.ts`); tipos recibidos incluyen M y otros (`compras/tipos.ts`).
- Mis Comprobantes de ARCA (`misComprobantes.ts`): importa recibidos para controlar y registrar en lote.
- Facturas recibidas por foto/PDF leídas con IA (`recibidas.ts`): se controlan CUIT, que cierren los importes y que
  el receptor sea la empresa; quedan para revisión humana.

## Retenciones y percepciones
- **Ganancias RG 830** al pagar: cálculo puro en `compras/ganancias.ts` (por proveedor, régimen y mes calendario),
  tabla del Anexo VIII con importes vigentes en `compras/rg830.ts` (cambiar ahí con cita de la RG). Inscripto/no
  inscripto desde la ficha (`terceros.ganancias_inscripto`). Certificado numerado.
- **IIBB**: padrones provinciales (`impuestos/padronesIibb.ts`; los archivos tienen millones de renglones: mirá cómo se
  importan antes de tocar, nunca los cargues enteros en memoria ni en el contexto),
  percepciones en facturas, retención al pagar. **ARBA** (`impuestos/arba.ts`): alícuotas por CUIT y **COT**
  (`comercial/cot.ts`) para remitos que viajan por Provincia de Buenos Aires.
- Resumen del mes como agente y como sujeto pasivo: `impuestos/retenciones.ts`.

## Libro IVA Digital y presentaciones
- `impuestos/libroIva.ts` (RG 4597): cuatro archivos de **ancho fijo** (ventas cbte 266 car., alícuotas 62; compras ídem).
  Cambiar un campo exige respetar posiciones: hay pruebas con renglones esperados exactos (`libroIva.test.ts`).
- `impuestos/controles.ts`: lo que haría rechazar la importación en el Portal IVA (cada control dice qué, por qué y cómo
  arreglarlo). `cruceArca.ts`: cruce con Mis Comprobantes Recibidos antes de presentar.
- `impuestos/presentaciones.ts`: marcar presentada **cierra el período** de ese impuesto; para corregir, se reabre y se
  rectifica. `contabilidad/cierre.ts` asienta la liquidación de IVA al presentar.
- `impuestos/vencimientos.ts`: calendario por terminación de CUIT con avisos por correo.

## CUIT
`validarCuit` (dígito verificador, devuelve `{ valido, cuit | error }`) y `formatearCuit` en `src/lib/cuit.ts`.
El CUIT de la empresa no se cambia (si cambia, es otra empresa: `empresa/datos.ts`). CUIT de prueba válidos en
pruebas: `30111111118`, `30222222226`, `30999176522`.

## Checklist fiscal
- [ ] Ningún comprobante autorizado se modifica; correcciones por NC/ND o anulación con contraefecto
- [ ] Dinero con `D`/`aImporte`; IVA por alícuota con `aImporteArca`; montos comparados como string en pruebas
- [ ] Códigos vía `tipos.ts`/catálogos, no números mágicos; norma citada en comentario
- [ ] Llamadas a ARCA fuera de transacción, con estado pendiente ante incertidumbre; pruebas con `ArcaFalso`
- [ ] Bloqueos de período y de IVA presentado controlados
- [ ] `docs/05-impuestos-e-informes.md` actualizado si cambia el comportamiento
