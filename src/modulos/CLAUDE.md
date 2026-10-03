# src/modulos — reglas de negocio

Detalle y plantillas: skill `erp-logica-dominio` (y `erp-fiscal-arca` / `erp-circuitos` según el área).

- Firma: `fn(tx: Transaccion, usuarioId: string | null, entrada: unknown, ...)`. La `tx` viene de `conEmpresa`/`enLaEmpresa`: RLS ya activo, no filtres por `empresa_id` (salvo tablas de plataforma, como en `empresa/usuarios.ts`).
- Nada de `next/*`, cookies, sesión ni `db()` acá.
- Entrada validada con Zod 4 (`{ error: '...' }`); errores esperables se devuelven (`{ ok: false, errores }`), no se lanzan.
- `auditar(tx, …)` en la misma transacción. Correos con `encolarCorreo`, webhooks con `emitir`: se encolan, se envían después.
- Dinero con `D`/`aImporte` (`lib/dinero.ts`); fechas con `hoyArgentina()` y `hoy` como parámetro para poder probar.
- Numeración con `siguienteNumero`; períodos cerrados con `controlarBloqueo`; nada se borra si tiene efecto: se anula y se revierte.
- Llamadas HTTP externas fuera de la transacción, con el cliente inyectado (ver `facturacion/comprobantes.ts#emitirComprobante`).
- Archivos sin imports de servidor (`tipos.ts`, `medios.ts`, `calculo.ts`) pueden usarse desde el navegador: mantenelos puros.
- Prueba al lado (`<archivo>.test.ts`) con `baseDePrueba()` + `conEmpresa`; montos comparados como strings.
- Ubicar funciones sin abrir archivos: `node .claude/skills/erp-contexto/scripts/mapa.mjs <area>`.
