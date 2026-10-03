# Línea base de hallazgos

Primera corrida de `invariantes.mjs`: **2026-10-03**, sobre `main` en `eee673e` (688 archivos de `src/`).
Cuando se arregle algo o aparezca un patrón nuevo, actualizá este archivo (fecha + qué cambió) para que la próxima
sesión no redescubra lo mismo.

## Invariantes (ERROR)
Sin casos. `db()` solo en `src/db` e `instrumentation-node.ts` (migración al arrancar, legítimo); todas las acciones de
zonas con sesión pasan por `enLaEmpresa` o un envoltorio (`enContratos`, `exigirAdmin`…); ningún componente cliente
importa servidor; ninguna capa invertida (las pruebas de la API v1 importan sus rutas a propósito).

## Para corregir (bugs chicos confirmados)
Sin casos abiertos. Resueltos el 2026-10-03 (rama `claude/fix-fechas-y-destino-seguro`):
- ~~`compras/acciones.ts:127`~~ — `aplicarNotaCredito` usaba el día UTC; ahora `hoyArgentina()`.
- ~~`cobros-online/page.tsx` y `configuracion/suscripcion/page.tsx`~~ — mostraban `creado` en UTC; ahora
  `fechaCorta(hoyArgentina(creado))`.
- ~~`ingresar/acciones.ts`~~ — `destinoSeguro` (helper puro exportado desde un `'use server'`, publicado como acción)
  pasó a `src/lib/auth/destino.ts`. Regla en `erp-pantallas`.

## Revisar (AVISO, puede ser seguro)
- `fechas-utc`: 0 casos. Las 13 ocurrencias restantes se revisaron una por una el 2026-10-03:
  - Corregidas (bugs menores): `crm/[id]/PiezasFicha.tsx` ("Mañana" se armaba con la hora local del navegador y se
    formateaba en UTC), `whatsapp/agente.ts` (ventana de 30 días) y `arca/cliente.ts` (vencimiento del CAE simulado):
    ahora `sumarDias(hoyArgentina(), n)`. `importacion/persat.ts`: mismo resultado, ahora con `hoyArgentina(Date)`.
  - Seguras, sin cambios: `impuestos/vencimientos.ts`, `contabilidad/{asientos,automaticos,cierre}.ts`,
    `servicio/agenda.ts` y `impuestos/vencimientos/page.tsx` (aritmética sobre `T12:00:00Z` / `Date.UTC`);
    `importacion/persatApi.ts` (solo una etiqueta de avance).
  - El auditor ya no marca la aritmética anclada a `T12:00:00Z` / `Date.UTC` hecha hasta 8 renglones antes; si vuelve
    a aparecer un caso, es una fecha sin ancla: leelo con cuidado.

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
