# Servicio técnico: qué hace Persat y cómo lo replicamos

Persat (PERSAT S.R.L., Buenos Aires, desde 2013) es el software de gestión de técnicos en campo de referencia para pymes argentinas. Tiene una plantilla oficial para técnicos de fotocopiado y en su API usa las fotocopiadoras como ejemplo de "objetos en cliente". Este documento resume cómo funciona (relevado de su centro de ayuda `docs.persat.com.ar` y de su API `docs.api.persat.com.ar`, octubre de 2026), lo compara con el ERP y fija el orden de trabajo.

Marcas: **[doc]** confirmado en la ayuda o la API; **[mkt]** solo en marketing; **[no]** no existe o no se encontró.

## 1. Cómo funciona Persat

### Órdenes de trabajo (OT) [doc]

- Cada **tipo de OT** es una plantilla con dos formularios: **instrucciones** (lo completa la oficina) y **devolución** (lo completa el técnico en el celular). Cada cambio de la plantilla crea una **versión nueva**; las versiones no se borran, así el histórico no se rompe.
- La OT lleva cliente, tipo y versión, fecha, hora, duración estimada en minutos, técnico, estado, instrucciones y resultados.
- Estados y colores del calendario:

| Estado              | Cuándo                                                            | Color         |
| ------------------- | ----------------------------------------------------------------- | ------------- |
| Pendiente           | Sin fecha ni técnico                                              | Lista lateral |
| Proyectada          | Con fecha y hora, sin técnico                                     | Celeste       |
| Asignada            | Con fecha, hora y técnico                                         | Azul          |
| Informe             | El técnico envió la devolución; falta que la revise el supervisor | Lila          |
| Vencida             | Pasó el plazo para informar (48 h por defecto)                    | Rojo          |
| Cerrada OK          | Hecha sin pendientes                                              | Verde         |
| Cerrada con desvío  | Hecha con pendiente o aclaración                                  | Amarillo      |
| Cerrada no cumplida | No se hizo                                                        | Rojo          |

- Una vez cerrada, el técnico no puede cambiarla. El tablero mide si coinciden el cierre que propone el técnico y el que pone el supervisor.

### Formularios [doc]

- Campos: texto (199 caracteres), párrafo (500), número, fecha, hora, selección simple, selección múltiple, etiqueta, link, texto fijo, cambio de sección, fotos (hasta 10), firmas, tabla libre con columnas, tabla de catálogo con columnas calculadas (cantidad × precio, IVA), lista de equipos del cliente y tabla para actualizar datos del equipo (por ejemplo, un contador).
- Obligatorios por casilla; tablas con mínimo de filas.
- **No tiene lógica condicional** (mostrar un campo según otra respuesta).
- Biblioteca de plantillas por rubro: fotocopiado, alarmas, climatización, etc.
- Formularios sueltos (fuera de una OT) que caen en una bandeja de entrada con estados propios de color.

### Calendario y despacho [doc]

- Calendario por día, semana o mes con una fila por técnico y las pendientes a un costado; se asigna arrastrando.
- **Coordinator**: elegida la OT, la fecha y los técnicos, busca los mejores huecos de agenda según el horario laboral y el punto de partida de cada técnico, y los califica con estrellas.
- Hoja de ruta optimizada (mínimo 3 clientes), mapa en tiempo real, historial de recorridos, geocercas y alertas (entrada, salida, permanencia, velocidad). El rastreo es una licencia aparte.

### App del técnico [doc]

- Android (no hay iOS). Agenda del día, navegación con Google Maps, formulario de devolución con fotos y firma, materiales usados desde el catálogo, sincronización para trabajar sin señal y constancia en PDF con el logo.
- App aparte de fichada (entrada y salida de la jornada) con GPS.

### Preventivo [doc]

- "OT repetitiva" por **cliente**: semanal o mensual, cada N, desde una fecha y hora. Genera las OT solas.
- Por odómetro o por tiempo solo para la flota de vehículos. **No hay preventivo por contador de copias** [no].

### Clientes y equipos [doc]

- Ficha de cliente con hasta 20 campos propios, contactos, grupos de clientes (cada usuario ve solo sus grupos), historial de OT y formularios, y recordatorios ("seguimientos") con aviso por email.
- Objetos en cliente por categoría (fotocopiadora, aire acondicionado…), con un campo único (serie) y columnas propias. **No tiene historial por equipo** [no]: es la queja de su única reseña en Capterra.
- Un cliente es un único punto en el mapa: no hay sucursales [no].

### Portal, avisos y otros [doc salvo indicación]

- Portal de clientes con color y logo: el cliente pide servicio con formularios habilitados, ve sus OT, el link de seguimiento del técnico y descarga los PDF.
- Email al cliente recordando la visita, con logo. WhatsApp e IA por WhatsApp como producto aparte [mkt]. Encuesta de satisfacción al cerrar [mkt].
- Reportes por formulario a PDF y Excel, panel de actividad del día, tablero gerencial (cumplimiento por técnico, horas por cliente, primera visita resuelta, tiempo objetivo contra real), asistente de IA sobre los datos.
- API REST con clave, paginada; webhooks (cliente, formulario, OT finalizada, entregas); Make como integración sin código.
- Roles con 79 permisos y visibilidad por grupos de clientes.
- **No factura, no lleva stock real ni contratos** [no]: se integra con el ERP.
- Desde US$ 20 por usuario y mes.

## 2. Comparación con el ERP

| Función                                                                 | Persat               | ERP                     | Estado                                 |
| ----------------------------------------------------------------------- | -------------------- | ----------------------- | -------------------------------------- |
| Tipos de OT con instrucciones y devolución versionadas                  | Sí                   | Sí                      | Hecho                                  |
| Estados pendiente → proyectada → asignada → informe → cerrada / vencida | Sí                   | Sí                      | Hecho                                  |
| Cierre del supervisor con tipo (OK, desvío, no cumplida)                | Sí                   | Sí                      | Hecho                                  |
| Formularios con fotos, firma, tablas, equipo, contador                  | Sí                   | Sí                      | Hecho                                  |
| Lógica condicional en formularios                                       | **No**               | Sí                      | Hecho (mejor que Persat)               |
| Calendario por técnico con arrastrar y soltar                           | Sí                   | Sí                      | Hecho                                  |
| Asistente de huecos (horario laboral, carga)                            | Sí                   | Sí, sin tiempo de viaje | Hecho (viaje en fase C, con mapas)     |
| App del técnico: agenda, llegada y salida con GPS, devolución, firma    | Android              | Web (Android e iPhone)  | Hecho                                  |
| Materiales usados con descuento de stock real (depósito por camioneta)  | **No**               | Sí                      | Hecho                                  |
| Contador tomado en la visita como lectura del contrato                  | Manual               | Sí                      | —                                      |
| Preventivo semanal o mensual                                            | Por cliente          | Por equipo o cliente    | Hecho                                  |
| Preventivo por contador de copias                                       | **No**               | Sí                      | Hecho (mejor que Persat)               |
| Constancia PDF con firma                                                | Sí                   | Sí                      | Hecho                                  |
| Historial por equipo                                                    | **No**               | Sí                      | —                                      |
| Facturación con ARCA y contratos por copia                              | **No**               | Sí                      | —                                      |
| Trabajo sin señal (offline)                                             | Sí                   | No                      | Fase B                                 |
| Recordatorios (seguimientos) de cliente                                 | Sí                   | No                      | Fase B                                 |
| Aviso al cliente por email (visita, cierre con PDF)                     | Sí                   | No                      | Fase B                                 |
| Encuesta de satisfacción al cerrar                                      | [mkt]                | No                      | Fase B                                 |
| SLA por prioridad con alertas                                           | [mkt]                | No                      | Fase B (con contratos)                 |
| Tablero de indicadores (cumplimiento, primera visita, tiempos)          | Sí                   | No                      | Fase B                                 |
| Portal de clientes                                                      | Sí                   | No                      | Fase C                                 |
| Mapa de técnicos, rutas, geocercas                                      | Sí (licencia aparte) | No                      | Fase C                                 |
| API y webhooks                                                          | Sí                   | No                      | Fase C (con el módulo de API del plan) |
| Formularios sueltos con bandeja de entrada                              | Sí                   | No                      | Fase C                                 |
| Asistente de IA sobre los datos, WhatsApp                               | Aparte               | No                      | Fase C                                 |

## 3. Decisiones de diseño

- **La app del técnico es una web para el celular**, no una app nativa: funciona en Android y iPhone sin pasar por las tiendas, y la cámara, el GPS y la firma se toman desde el navegador. Para trabajar sin señal (fase B) se convierte en aplicación instalable que guarda la cola de envíos.
- **Los formularios se guardan como definición JSON versionada**: cada versión es inmutable (lo garantiza la base) y cada OT apunta a la versión con la que se creó.
- **Los materiales del formulario son artículos reales**: salen del depósito del técnico (su camioneta) o del central, y quedan como renglones de la orden para facturar si va con cargo.
- **El contador del formulario es una lectura del equipo**: alimenta la facturación por copias y el preventivo por copias.
- **Una OT vence** si sigue asignada pasado el plazo del tipo (48 h por defecto) desde la hora programada; se marca al consultar, sin procesos en segundo plano.
- **Fotos y firmas se guardan en la base**, reducidas en el celular antes de subir (lado mayor de 1600 px, JPEG), con el aislamiento por empresa de siempre.

## 4. Dónde está cada cosa

- Lógica: `src/modulos/servicio/` (`formularios.ts` el motor de formularios, `tiposOrden.ts` las versiones, `servicio.ts` el ciclo de la orden, `agenda.ts` calendario y huecos, `preventivo.ts`, `archivos.ts`).
- Pantallas: `/servicio` (órdenes), `/servicio/calendario`, `/servicio/tipos`, `/servicio/preventivos`, `/tecnico` (Mi agenda, para el celular) e `/imprimir/servicio/[id]` (constancia).
- Técnicos: Configuración › Técnicos (jornada, días, camioneta y el email con el que entra a Mi agenda). Rol de sistema "Técnico": ve solo sus órdenes.
- Vencimientos y preventivos se ponen al día al abrir el listado, el calendario o la agenda: no hace falta un proceso aparte.
