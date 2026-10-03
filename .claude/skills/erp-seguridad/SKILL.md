---
name: erp-seguridad
description: Reglas y checklist de seguridad del ERP multiempresa — aislamiento por empresa (RLS forzado, conEmpresa vs comoPlataforma, tablas de plataforma sin RLS), permisos y planes, sesiones y subdominios por empresa, frenos de intentos, secretos cifrados, entradas externas (avisos, archivos subidos, URLs, ZIP/XLSX), redirecciones y encabezados. Usala al revisar un cambio, diff o PR; al tocar autenticación, sesiones, usuarios, roles, invitaciones, rutas públicas o /api, tablas de plataforma, subidas de archivos o cualquier código que lea o escriba datos sin pasar por enLaEmpresa/conEmpresa; y siempre que el usuario pida una revisión o auditoría de seguridad.
---

# Seguridad del ERP

Un bug acá no es "un error": es ver o cambiar datos de **otra empresa cliente** del SaaS, o escalar permisos.
Referencia completa: `docs/11-seguridad.md` (cómo está armado + revisión de octubre de 2026).

## Modelo de amenazas (lo que hay que proteger)
1. **Empresa A viendo datos de B** — lo impide la base (RLS forzado + FK compuestas), siempre que el código pase por
   `conEmpresa`. El riesgo está en lo que escapa: tablas de plataforma, `comoPlataforma`, SQL de dueño, cachés.
2. **Usuario haciendo más de lo que su rol/plan permite** — `enLaEmpresa(permiso)` en cada acción; nadie reparte
   permisos que no tiene; nadie cambia su propio rol; acceso total solo lo maneja un dueño.
3. **Entradas no confiables** — acciones del servidor (son POST públicos), API v1, avisos externos, archivos, URLs.
4. **Secretos** — certificados de ARCA, tokens de tiendas/pasarelas, `ERP_CLAVE_MAESTRA`, sesiones.

## Checklist de revisión (recorrelo sobre el diff)

**Acceso a datos**
- [ ] Todo acceso a datos de empresa dentro de `enLaEmpresa` (acciones/páginas), `conEmpresa` (cron, avisos, API) o
      `conApi` (API v1). Nunca `db()` directo en código de app (solo `src/db/*`, migraciones y scripts).
- [ ] `comoPlataforma` solo para tablas de plataforma (usuarios, sesiones, membresías, empresas, frenos…). Con ese
      acceso las tablas de empresa devuelven cero filas: si algo "no trae datos", no lo arregles saliendo del RLS.
- [ ] Consultas sobre tablas de plataforma con `empresa_id` (roles, membresías, invitaciones, claves_cobro,
      whatsapp_numeros…) **filtran por la empresa de la sesión a mano** — RLS no las cubre. El `empresaId` sale de la
      sesión, nunca del formulario.
- [ ] Tabla nueva con `empresaId()` + `erp_aislar_por_empresa` (skill `erp-esquema-migraciones`); FK compuestas.
- [ ] Si cuelga de un cliente: política `visibilidad_grupos` (usuarios con grupos de clientes).
- [ ] IDs de URL validados (`/^[0-9a-f-]{36}$/i`) y "no existe" → `notFound()`/404, sin distinguir "existe en otra empresa".

**Permisos y plan**
- [ ] Cada acción del servidor exige su permiso (`enLaEmpresa('modulo.accion')`), aunque la pantalla ya lo pida:
      la acción es un endpoint propio. Lectura `.ver`, escritura con permiso de escritura (no al revés).
- [ ] Gestión de usuarios/roles: no otorgar permisos que quien opera no tiene; no tocar el propio rol; `*` solo dueños.
- [ ] Solo lectura por suscripción respetada (lo resuelve la sesión: no lo puentees con `comoPlataforma`).
- [ ] Acciones de técnicos/portal: cada uno opera solo lo suyo (sus visitas, su cliente).

**Sesión, subdominio y frenos**
- [ ] Sesión vía `sesionActual`/`requerirEmpresa` (cookie `erp_sesion` httpOnly, Lax; en base solo el hash).
- [ ] Con subdominios (`DOMINIO_EMPRESAS`): la sesión vale solo en el subdominio de su empresa; no agregues `Domain` a la cookie.
- [ ] Endpoints adivinables (ingreso, códigos, recuperación, registro, formularios públicos) con freno:
      `superado(claves, maximo, ventanaMs)` + `anotar(claves)` de `src/lib/frenos.ts` (en base: sirve con varias
      instancias). IP del cliente con `ipDe(headers)` (último valor de `X-Forwarded-For`, el que agrega el proxy).
- [ ] Redirecciones con destino del usuario (`?volver=`): solo rutas internas que empiezan con `/` y no con `//` ni `/\`.

**Entradas externas**
- [ ] Ruta pública agregada al `matcher` del proxy **y** autenticada por otro medio (firma, clave en la URL, token).
- [ ] Firmas con `timingSafeEqual`; el estado real se consulta a la plataforma; idempotencia ante avisos repetidos.
- [ ] URLs salientes con `direccionPermitida` (https, nada interno, IPv6 incluido).
- [ ] Archivos subidos: tipo por contenido (magic bytes, JPEG/PNG/WebP), tamaño máximo, servidos con `nosniff`
      (`servicio/archivos.ts`). ZIP/XLSX con tope de descompresión y cantidad (`lib/zip.ts`, `lib/xlsx.ts`).
- [ ] Texto de terceros que llega a la IA (WhatsApp, facturas): es dato, no instrucciones; herramientas acotadas al
      cliente de la conversación.
- [ ] Sin HTML crudo (`dangerouslySetInnerHTML`) salvo JSON-LD escapado o SVG generado (CSP sin nonces, `next.config.ts`).

**Secretos**
- [ ] Secretos de empresa cifrados con `ERP_CLAVE_MAESTRA`; claves de API como hash; tokens comparados en tiempo constante.
- [ ] Nada sensible en logs, auditoría, mensajes de error, respuestas de API ni en el repo (`.env` nunca se commitea).

## Errores que ya pasaron (no repetirlos)
De la revisión de octubre de 2026: invitación que permitía probar contraseñas sin límite; escalada de permisos al
administrar usuarios; débito automático barato que aplicaba una mejora de plan; freno de ingreso salteable falseando
`X-Forwarded-For` y en memoria; redirección abierta en `/ingresar?volver=/\otro.com`; bomba ZIP; anti-SSRF salteable
con `::ffff:127.0.0.1`; pagos duplicados por avisos simultáneos; claves de API activas con empresa suspendida o
creador dado de baja; grupos de clientes sin cubrir tablas hijas; `erp_app` pudiendo darse admin de plataforma; caché
del celular del técnico con datos tras cerrar sesión. Pendientes de producto (verificación de email, titularidad del
CUIT, `node-forge`): ver docs/11 → "Pendiente".

## Cómo probar
- Primero el auditor estático: `node .claude/skills/erp-mejoras/scripts/invariantes.mjs --cambios` (detecta `db()`
  directo, acciones sin permiso, cliente importando servidor, capas invertidas, acciones públicas sin token/freno).
- `npx vitest run src/db/seguridad.test.ts` (todas las tablas aisladas, escritura cruzada rechazada, auditoría inmutable).
- Para una función sensible, prueba con **dos empresas**: lo creado en A no se ve ni se modifica desde B
  (`nuevoTercero(empresaA…)` / `conEmpresa(empresaB…)` en `seguridad.test.ts` como modelo).
- Permisos: probar que sin el permiso la acción devuelve el mensaje de `SinPermiso` y no escribe.

## Formato del informe de revisión
Ordenado por gravedad. Por hallazgo, una línea de ubicación y tres de contenido:

```
[Alta] src/app/(app)/x/acciones.ts:42 — Acción sin control de permiso
  Qué pasa: cualquier usuario de la empresa puede anular comprobantes llamando la acción.
  Por qué: usa requerirEmpresa() en vez de enLaEmpresa('ventas.anular').
  Arreglo: envolver en enLaEmpresa('ventas.anular', …) y capturar SinPermiso.
```
Si no hay hallazgos, decilo y listá qué se revisó. Si el usuario tiene `/code-review` o `/security-review`, se
pueden complementar; esta skill aporta el contexto multiempresa que esas revisiones genéricas no conocen.
