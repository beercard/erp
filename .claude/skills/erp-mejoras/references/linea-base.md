# Línea base de hallazgos

Primera corrida de `invariantes.mjs`: **2026-10-03**, sobre `main` en `eee673e` (688 archivos de `src/`).
Cuando se arregle algo o aparezca un patrón nuevo, actualizá este archivo (fecha + qué cambió) para que la próxima
sesión no redescubra lo mismo.

## Invariantes (ERROR)
Sin casos. `db()` solo en `src/db` e `instrumentation-node.ts` (migración al arrancar, legítimo); todas las acciones de
zonas con sesión pasan por `enLaEmpresa` o un envoltorio (`enContratos`, `exigirAdmin`…); ningún componente cliente
importa servidor; ninguna capa invertida (las pruebas de la API v1 importan sus rutas a propósito).

## Para corregir (bugs chicos confirmados)
- `src/app/(app)/compras/acciones.ts:127` — `aplicarNotaCredito(..., new Date().toISOString().slice(0, 10))`: la fecha
  de aplicación sale en UTC; entre las 21 y las 24 h de Argentina queda en el día siguiente (y puede chocar con un
  bloqueo de período). Cambiar por `hoyArgentina()`.
- `src/app/(app)/cobros-online/page.tsx:134` y `src/app/(app)/configuracion/suscripcion/page.tsx:117,183` — fecha de
  creación mostrada con `creado.toISOString().slice(0, 10)`: muestra el día UTC. Usar `hoyArgentina(creado)`.
- `src/app/ingresar/acciones.ts` — `destinoSeguro` es un helper puro exportado desde un archivo `'use server'`, así que
  queda publicado como acción del servidor. Moverlo a un archivo sin la directiva (o no exportarlo).

## Revisar (AVISO, puede ser seguro)
- `fechas-utc`: 17 casos. Muchos arman la fecha con `Date.UTC` o `T12:00:00Z` en otro renglón (seguros); revisar uno
  por uno en `impuestos/vencimientos.ts`, `contabilidad/*`, `servicio/agenda.ts`, `crm/[id]/PiezasFicha.tsx`.

## Deuda técnica (MEJORA)
- **Archivos largos** (> 700 líneas): `modulos/servicio/servicio.ts` (1353), `modulos/crm/crm.ts` (1013),
  `db/schema/servicio.ts` (876), `importacion/persat.ts` (814), `facturacion/comprobantes.ts` (790),
  `importacion/pymexis.ts` (784), `compras/FormularioCompra.tsx` (782), `servicio/Formularios.tsx` (779),
  `servicio/sueltos.ts` (703).
- **Helpers duplicados**: `deLaEmpresa` en 12 esquemas (candidato a `schema/comunes.ts`), `UUID` en 11 archivos,
  `texto` (Zod) en 16, `uuid`/`decimal` en 3.
- **Consultas en bucle** (10): `comercial/remitos.ts:162,197`, `compras/misComprobantes.ts:267`,
  `contratos/facturacion.ts:159`, `facturacion/comprobantes.ts:328`, `importacion/pymexis.ts:272`,
  `impuestos/vencimientos.ts:263`, `servicio/avisos.ts:356`, `servicio/sueltos.ts:270`, `servicio/tiposOrden.ts:103`.
  Prioridad: las que recorren renglones de un documento o todas las órdenes (crecen con el uso).
- **Pruebas faltantes** (piezas sin prueba propia; algunas se cubren indirectamente): `comunicaciones/` e `ia/` sin
  pruebas; en `compras/` faltan `pagos.ts` (retenciones al pagar) y `cuentas.ts`; en `tesoreria/` `cheques.ts` y
  `conciliacion.ts`; en `comercial/` `numeracion.ts` y `documentos.ts`.
- **`lib` → `modulos`**: `lib/auth/servidor.ts` → `plataforma/codigos`, `lib/auth/sesiones.ts` →
  `plataforma/suscripciones`, `lib/auth/recuperar.ts` → `comunicaciones/correo`.
- **Colores sueltos**: verde de WhatsApp `bg-[#25D366]` en `servicio/AvisosCliente.tsx` e `InvitarPortal.tsx` (sumar un
  token `--whatsapp`), y `#94a3b8` de respaldo en `servicio/tablero/page.tsx`.
- `dinero-number`: 45 usos de `Number()` sobre importes en `src/modulos`; la mayoría son comparaciones o contabilidad
  en centavos (intencional). Revisar sumas sin redondeo como `contabilidad/cierre.ts:266`.

## Hotspots (archivos de `src` más modificados en git, a la misma fecha)
`components/shell/Navegacion.tsx` (24), `db/schema/index.ts` (19), `proxy.ts` (17), `components/shell/PaletaComandos.tsx`
(17), `lib/permisos.ts` (13), `db/schema/servicio.ts` (13), `app/(app)/servicio/acciones.ts` (13). El `matcher` de
`proxy.ts` cambia con cada ruta pública: candidato a armarse desde una lista con nombre y comentario por entrada.
