# Seguridad

Cómo está protegido el sistema y qué salió de la revisión de seguridad de octubre de 2026.

## Cómo está armado

- **Aislamiento entre empresas en la base:** RLS forzado en todas las tablas con `empresa_id` y claves foráneas compuestas `(empresa_id, id)`. La aplicación trabaja con el rol `erp_app`, que no es dueño de las tablas.
- **Grupos de clientes:** políticas restrictivas por usuario (ver `docs/04-servicio-tecnico.md`, sección 12).
- **Contraseñas:** scrypt (N=2^15), comparación en tiempo constante, mínimo 10 caracteres con letras y números.
- **Sesiones:** token aleatorio de 32 bytes. En la base queda solo su hash. Cookie `httpOnly`, `secure` en producción y `SameSite=Lax`.
- **Frenos** (`src/lib/frenos.ts`): se guardan en la base, así que funcionan con varias instancias.
  - Ingreso: 8 fallidos por email y 30 por conexión cada 15 minutos. Comparten el freno de la invitación con cuenta existente.
  - Portal: 8 por cuenta y 30 por conexión.
  - "Olvidé mi contraseña" (sistema y portal): un correo por email cada 15 minutos.
  - Registro: 5 por conexión por hora.
  - Empresas nuevas: 5 por usuario por día.
  - Formulario de contacto: 5 por conexión por hora y 200 en total por hora.
- **IP del cliente:** el último valor de `X-Forwarded-For`, que agrega el proxy de confianza. Hace falta un proxy delante (Caddy, nginx, el balanceador) que agregue ese encabezado.
- **Encabezados** (`next.config.ts`): CSP, HSTS, `X-Frame-Options: DENY` y `frame-ancestors 'none'` (contra el clickjacking), `nosniff`, `Referrer-Policy` y `Permissions-Policy` (solo ubicación y cámara, que usa el técnico).
- **Secretos:** certificados de ARCA y tokens de tiendas cifrados con AES-256-GCM y `ERP_CLAVE_MAESTRA`. Claves de API guardadas como hash.
- **Avisos entrantes:**
  - Tienda Nube, WooCommerce y Mercado Pago: se verifican por firma.
  - Mercado Libre: no viene firmado, así que solo se usa para ir a buscar el pedido con el token del vendedor.
- **Direcciones externas** (webhooks y WooCommerce): solo https, nunca hacia la red interna. Se controlan IPv4 e IPv6, incluidas las IPv4 escritas como IPv6.
- **Archivos subidos:** solo JPEG, PNG y WebP (se mira el contenido, no la extensión), servidos con `nosniff`. Los ZIP y XLSX importados tienen tope de 100 MB descomprimidos y 2.000 archivos.

## Revisión de octubre de 2026: qué se corrigió

| Hallazgo                                                                                        | Gravedad           | Corrección                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La pantalla de invitación permitía probar contraseñas de cualquier cuenta sin límite            | Alta               | Mismo freno que el ingreso                                                                                                                                                                                                                                        |
| Quien administraba usuarios podía hacerse dueño o crear roles con más permisos                  | Alta               | Nadie reparte permisos que no tiene; el acceso total solo lo maneja un dueño; nadie cambia su propio rol                                                                                                                                                          |
| Un débito automático barato podía aplicar una mejora de plan o el ciclo anual                   | Alta               | El cambio se aplica solo si el cobro lo cubre; los meses se calculan según lo cobrado                                                                                                                                                                             |
| Faltaban los encabezados de seguridad (clickjacking, HSTS, CSP)                                 | Alta               | Agregados                                                                                                                                                                                                                                                         |
| El freno del ingreso se salteaba falseando `X-Forwarded-For` y vivía en memoria                 | Alta/Media         | IP del proxy de confianza; freno en la base, por email y por conexión                                                                                                                                                                                             |
| Sin freno en el portal, el registro, las empresas nuevas y la recuperación de clave             | Media              | Agregados                                                                                                                                                                                                                                                         |
| Redirección abierta en `/ingresar?volver=` (`/\otro.com`)                                       | Media              | Solo rutas internas, validadas contra el propio origen                                                                                                                                                                                                            |
| Bomba ZIP al importar planillas                                                                 | Media              | Topes de tamaño y cantidad                                                                                                                                                                                                                                        |
| La app del técnico dejaba órdenes y fotos en la caché del celular al cerrar sesión              | Media              | Se borran al volver al ingreso                                                                                                                                                                                                                                    |
| Filtro anti-SSRF salteable con IPv6 (`::ffff:127.0.0.1` y otras formas)                         | Media              | Listas de redes reservadas de Node (`BlockList`) para IPv4 e IPv6                                                                                                                                                                                                 |
| Pagos de Mercado Pago duplicados si el aviso llegaba dos veces a la vez                         | Media              | Índice único: el mismo cobro se registra una sola vez                                                                                                                                                                                                             |
| Claves de API activas con la empresa suspendida o con su creador dado de baja                   | Media              | Dejan de servir; además respetan los grupos de su creador                                                                                                                                                                                                         |
| Grupos de clientes sin cubrir presupuestos, pedidos, remitos y tablas hijas                     | Media              | Políticas agregadas                                                                                                                                                                                                                                               |
| Una tienda lenta podía demorar la tarea periódica de todas las empresas                         | Media              | Tope de tiempo por empresa, de tamaño por respuesta y de páginas                                                                                                                                                                                                  |
| `erp_app` podía darse permisos de administrador de la plataforma                                | Media              | Ya no puede escribir esa columna                                                                                                                                                                                                                                  |
| Formularios de servicio cargados con permisos de solo lectura; visitas a nombre de otro técnico | Media/Baja         | Se exige el permiso que corresponde y el técnico carga solo las suyas                                                                                                                                                                                             |
| No existía "olvidé mi contraseña" en el sistema                                                 | Media              | Enlace por email de un uso y una hora; cierra las sesiones abiertas                                                                                                                                                                                               |
| nodemailer con avisos de seguridad                                                              | Alta (dependencia) | Actualizado a la versión 10                                                                                                                                                                                                                                       |
| Varios menores                                                                                  | Baja               | State de WooCommerce de un solo uso; state y cookie de Tienda Nube tienen que coincidir; encuesta sin doble respuesta; enlaces solo http(s); errores internos sin detalle al usuario; informes en Excel de hasta dos años; FK compuesta en los cheques entregados |

## Pendiente (decisiones de producto)

- **Verificar el email al registrarse y al aceptar invitaciones.** Hoy, quien se registra primero con un email se queda con esa cuenta. La recuperación de clave por email permite que el dueño real la recupere, pero conviene confirmar el email antes de activar la cuenta.
- **Mandar la invitación por correo** en lugar de mostrarle el enlace a quien invita.
- **Titularidad del CUIT:** cualquiera puede registrar una empresa con un CUIT ajeno, pero no puede facturar con ella, porque el certificado de ARCA tiene que ser de ese CUIT. Conviene permitir que la empresa real reclame el CUIT presentando su certificado.
- **node-forge** (firma para ARCA) tiene un aviso sin corrección publicada. Afecta la verificación de firmas, que el sistema no usa. Se puede reemplazar por la firma CMS de `openssl` cuando haya tiempo.
- **Enlaces de seguimiento** que no vencen, avisos de Mercado Libre sin deduplicar y sin tope de fotos por formulario del portal: riesgo bajo; quedan anotados.
- **CSP sin `unsafe-inline`:** requiere nonces (render dinámico en todo el sitio) o SRI. Hoy el riesgo es bajo porque React escapa todo.
