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

| Función                                                                 | Persat               | ERP                                                     | Estado                          |
| ----------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- | ------------------------------- |
| Tipos de OT con instrucciones y devolución versionadas                  | Sí                   | Sí                                                      | Hecho                           |
| Estados pendiente → proyectada → asignada → informe → cerrada / vencida | Sí                   | Sí                                                      | Hecho                           |
| Cierre del supervisor con tipo (OK, desvío, no cumplida)                | Sí                   | Sí                                                      | Hecho                           |
| Formularios con fotos, firma, tablas, equipo, contador                  | Sí                   | Sí                                                      | Hecho                           |
| Lógica condicional en formularios                                       | **No**               | Sí                                                      | Hecho (mejor que Persat)        |
| Calendario por técnico con arrastrar y soltar                           | Sí                   | Sí                                                      | Hecho                           |
| Asistente de huecos (horario laboral, carga)                            | Sí                   | Sí, con el viaje desde la visita anterior               | Hecho (viaje en fase C)         |
| App del técnico: agenda, llegada y salida con GPS, devolución, firma    | Android              | Web (Android e iPhone)                                  | Hecho                           |
| Materiales usados con descuento de stock real (depósito por camioneta)  | **No**               | Sí                                                      | Hecho                           |
| Contador tomado en la visita como lectura del contrato                  | Manual               | Sí                                                      | —                               |
| Preventivo semanal o mensual                                            | Por cliente          | Por equipo o cliente                                    | Hecho                           |
| Preventivo por contador de copias                                       | **No**               | Sí                                                      | Hecho (mejor que Persat)        |
| Constancia PDF con firma                                                | Sí                   | Sí                                                      | Hecho                           |
| Historial por equipo                                                    | **No**               | Sí                                                      | —                               |
| Facturación con ARCA y contratos por copia                              | **No**               | Sí                                                      | —                               |
| Trabajo sin señal (offline)                                             | Sí                   | App instalable; llegada, fotos, firma e informe en cola | Hecho (fase B)                  |
| Recordatorios (seguimientos) de cliente                                 | Sí                   | Sí, con aviso por email                                 | Hecho (fase B)                  |
| Aviso al cliente por email (visita, cierre con resumen)                 | Sí                   | Email y WhatsApp                                        | Hecho (fase B)                  |
| Encuesta de satisfacción al cerrar                                      | [mkt]                | Estrellas y NPS, enlace sin usuario                     | Hecho (fase B)                  |
| SLA por prioridad con alertas                                           | [mkt]                | Por prioridad o contrato, alerta a coordinación         | Hecho (fase B)                  |
| Tablero de indicadores (cumplimiento, primera visita, tiempos)          | Sí                   | Sí, más reincidencias y consumos                        | Hecho (fase B)                  |
| Portal de clientes                                                      | Sí                   | Equipos, seguimiento, pedir servicio, contadores        | Hecho (fase C)                  |
| Mapa de técnicos y hoja de ruta optimizada                              | Sí (licencia aparte) | Sí, incluido (OpenStreetMap, sin costo por técnico)     | Hecho (fase C)                  |
| Historial de recorridos, geocercas y alertas                            | Sí (licencia aparte) | Recorrido 30 días, entrada y salida del cliente         | Hecho, sin alertas de velocidad |
| Fichada de la jornada con GPS                                           | App aparte           | En Mi agenda, con resumen de horas y km                 | Hecho                           |
| API y webhooks                                                          | Sí                   | API REST con claves y webhooks firmados                 | Hecho (fase C)                  |
| Formularios sueltos con bandeja de entrada                              | Sí                   | Oficina, técnico y portal; estados de color             | Hecho                           |
| Reportes por formulario a Excel                                         | Sí                   | Tipos de orden y formularios, columna por campo         | Hecho                           |
| Asistente de IA sobre los datos, WhatsApp                               | Aparte               | No                                                      | Fase C                          |
| Enlace público de seguimiento (sin usuario)                             | Sí                   | Pasos, técnico y "en camino" con distancia y minutos    | Hecho (fase E)                  |
| Etiquetas de colores en las órdenes                                     | Sí                   | Listado, filtro, calendario y webhooks                  | Hecho (fase E)                  |
| Varios técnicos por orden (responsable y acompañantes)                  | Sí                   | Agenda, calendario y huecos de cada uno                 | Hecho (fase E)                  |

## 3. Decisiones de diseño

- **La app del técnico es una web para el celular**, no una app nativa: funciona en Android y iPhone sin pasar por las tiendas, y la cámara, el GPS y la firma se toman desde el navegador. Para trabajar sin señal (fase B) se convierte en aplicación instalable que guarda la cola de envíos.
- **Los formularios se guardan como definición JSON versionada**: cada versión es inmutable (lo garantiza la base) y cada OT apunta a la versión con la que se creó.
- **Los materiales del formulario son artículos reales**: salen del depósito del técnico (su camioneta) o del central, y quedan como renglones de la orden para facturar si va con cargo.
- **El contador del formulario es una lectura del equipo**: alimenta la facturación por copias y el preventivo por copias.
- **Una OT vence** si sigue asignada pasado el plazo del tipo (48 h por defecto) desde la hora programada; se marca al consultar, sin procesos en segundo plano.
- **Fotos y firmas se guardan en la base**, reducidas en el celular antes de subir (lado mayor de 1600 px, JPEG), con el aislamiento por empresa de siempre.

## 4. Dónde está cada cosa

- Lógica: `src/modulos/servicio/` (`formularios.ts` el motor de formularios, `tiposOrden.ts` las versiones, `servicio.ts` el ciclo de la orden, `agenda.ts` calendario y huecos, `preventivo.ts`, `archivos.ts`).
- Pantallas: `/servicio` (órdenes), `/servicio/calendario`, `/servicio/mapa`, `/servicio/jornadas`, `/servicio/formularios`, `/servicio/bandeja`, `/tecnico/formularios`, `/configuracion/integraciones`, `/portal`, `/servicio/tipos`, `/servicio/preventivos`, `/tecnico` (Mi agenda, para el celular) e `/imprimir/servicio/[id]` (constancia).
- Técnicos: Configuración › Técnicos (jornada, días, camioneta y el email con el que entra a Mi agenda). Rol de sistema "Técnico": ve solo sus órdenes.
- Vencimientos, preventivos, avisos de visita, alertas de SLA y recordatorios se ponen al día al abrir el listado o el calendario, y desde la tarea programada `POST /api/cron/servicio` (con `CRON_SECRET`), que además manda los correos.
- Correos: todo pasa por la bandeja de salida (Servicio técnico › Configuración). Con `SMTP_URL` salen solos; sin ella quedan guardados y cada aviso trae el texto listo para WhatsApp.
- SLA en horas corridas desde que se abre la orden: respuesta = llegada del técnico, resolución = informe. Por prioridad, o los del contrato si los tiene.
- Encuesta: el enlace lleva la empresa y un secreto derivado con `ERP_CLAVE_MAESTRA`; es siempre el mismo para una orden y se responde una sola vez.
- API (fase C): Configuración › API e integraciones. Claves `erp_…` (se guardan como hash; solo lectura o lectura y escritura), endpoints en `/api/v1` (clientes, equipos, tipos de orden, órdenes y lecturas), paginados con `offset` y `limit`. Necesita la función "api" del plan.
- Webhooks (fase C): por evento (`orden.creada`, `orden.programada`, `orden.informada`, `orden.cerrada`, `orden.cancelada`, `encuesta.respondida`, `lectura.registrada`), firmados con `X-ERP-Firma: t=…,v1=HMAC-SHA256(secreto, "t.cuerpo")`. Si el receptor no contesta 2xx se reintenta (1, 2, 4… minutos, hasta 8 veces). No se aceptan direcciones internas ni http salvo con `WEBHOOKS_PERMITIR_LOCAL=1` (solo para desarrollo).
- Portal de clientes (fase C): se habilita en Servicio técnico › Configuración, con su color. Entrada: `/portal/ingresar?empresa=<CUIT>`. Cada usuario es de un cliente, se invita por email o WhatsApp y elige su contraseña. Ve sus equipos y órdenes (con el seguimiento paso a paso, la constancia y la encuesta), pide servicio con los tipos de orden marcados "portal" y carga contadores. La base aísla por empresa; el filtro por cliente lo hace el módulo `src/modulos/portal/portal.ts` en cada consulta.
- Mapa y rutas (fase C): `/servicio/mapa`. Las órdenes toman la ubicación propia o la de su equipo; se buscan en OpenStreetMap (Nominatim, de a una por segundo, a pedido) o se marcan con un clic. La primera llegada con GPS ubica al equipo. La hoja de ruta pone las visitas con hora a su hora y ordena las demás por cercanía (vecino más cercano y 2-opt), con viaje estimado a 25 km/h en línea recta × 1,3 y el enlace a Google Maps. El técnico puede compartir su ubicación desde Mi agenda (cada minuto, mientras tiene la app abierta; se guardan 2 días).
- Formularios sueltos: Servicio técnico › Formularios (definiciones, mismo editor y lógica condicional que los tipos de orden; versionados) y › Bandeja de entrada (estados de color definidos por la empresa; los finales no cuentan como pendientes). Los completa la oficina, el técnico desde Mi agenda › Formularios (con la ubicación del celular) o el cliente desde el portal. Mientras se completa es un borrador en el servidor (las fotos y la firma se suben ahí y lo escrito se guarda solo). Webhook `formulario.enviado`.
- Jornada y geocercas: el técnico ficha la entrada y la salida en Mi agenda (al empezar se comparte la ubicación). Con cada posición se registra la entrada y la salida del lugar de cada orden del día (radio en Servicio técnico › Configuración, 150 m por defecto, con margen para que el GPS no rebote); se ve en la orden. Las posiciones se guardan 30 días: el mapa muestra el recorrido del día y `/servicio/jornadas` resume horas, km, visitas y tiempo en clientes, con descarga a Excel.
- Reportes a Excel: en cada tipo de orden ("Órdenes en Excel") y en cada formulario suelto, una fila por orden o envío y una columna por campo (de todas las versiones). Los .xlsx se arman sin dependencias (`src/lib/xlsx.ts`).
- Sin señal: la app del técnico se puede instalar (manifest y service worker). Lo visto queda guardado en el celular; la llegada, las fotos, la firma y el informe cargados sin señal quedan en una cola y se mandan solos al volver. El borrador del informe se guarda mientras se escribe.
- Enlace de seguimiento (fase E): `/seguimiento/<empresa>.<orden>.<firma>`, sin usuario. La firma es un HMAC del id de la orden con `ERP_CLAVE_MAESTRA`: el enlace es siempre el mismo, no se guarda y no se puede adivinar ni adulterar. Muestra los pasos de la orden y, el día de la visita, si el técnico compartió su ubicación en los últimos 10 minutos y todavía no llegó, la distancia y los minutos estimados (nunca su posición). Va en el aviso de la visita (con `APP_URL` en los automáticos) y se copia desde la orden ("Enlace de seguimiento"). La página se actualiza sola cada minuto.

- Etiquetas (fase E): se definen en Servicio técnico › Configuración (nombre y color; una inactiva no se ofrece pero sigue en las órdenes que la tienen). En la orden, "Agregar etiquetas"; el listado filtra por etiqueta y el calendario las muestra en cada tarjeta. Van en la API y los webhooks (`etiquetas`, con los nombres).
- Acompañantes (fase E): al programar la visita, además del técnico responsable se marcan los que van con él. La orden aparece en Mi agenda de cada acompañante ("Acompañás a …", sin cargar el informe), en su fila del calendario (punteada, no se arrastra) y les ocupa el horario en el asistente de huecos y en la carga del día. Sin responsable no hay acompañantes; al cambiar el responsable se conservan, y el responsable no puede ser también acompañante. Van en la API y los webhooks (`acompanantes`).

## 5. Lo que falta frente a la API de Persat (relevamiento de octubre de 2026)

Relevado de la documentación completa de la API (`docs.api.persat.com.ar`, 186 páginas). Para ver la configuración real de una cuenta: `npm run persat:relevar` con `PERSAT_API_KEY` (solo hace GET; deja todo en `.data/persat/`, fuera de git). La clave de Persat tiene acceso total (puede borrar clientes con su historial): no usarla para escribir.

**Enfoque (acordado en octubre de 2026):** no copiar a Persat función por función. El objetivo es que quien hoy usa Persat (1) pueda migrar sin perder historia, (2) encuentre lo que usa todos los días (lo decide el relevamiento de cuentas reales, no la lista completa de la API) y (3) tenga una razón para quedarse: todo en un solo sistema con facturación, stock y contratos. Se replican funciones, nunca textos, nombres, pantallas ni marca de Persat: los mensajes al cliente se escriben propios. Quedan afuera por ahora la app nativa de Android, el módulo de entregas y logística, el GPS de vehículos con hardware, el asistente de IA por WhatsApp y los permisos sueltos.

Por prioridad:

1. ~~Importar desde Persat~~ (hecho: ver la sección 7).
2. ~~Enlace público de seguimiento~~ (hecho).
3. ~~Etiquetas de colores en las órdenes~~ (hecho).
4. ~~Varios técnicos por orden~~ (hecho).
5. **Historial de estados de los formularios** (quién y cuándo) y **cambio de estado masivo** en la bandeja.
6. **Grupos de clientes que limitan qué ve cada usuario.**
7. **Horario laboral por día** (licencias, feriados, horarios especiales) además del semanal, para el asistente de huecos.
8. **Zonas de trabajo por técnico** con alertas de salida de zona, y **visitas detectadas por GPS** a cualquier cliente (no solo a las órdenes del día).
9. **Recerrar una orden cerrada** (cambiar el tipo de cierre sin reabrirla).
10. **Entregas y rutas** (logística con ventanas horarias, capacidad y retrabajos): solo si la cuenta lo usa; el relevamiento lo dice.

Lo que Persat no tiene y el ERP sí: lógica condicional en formularios, preventivo por contador de copias, historial por equipo, stock real de materiales, facturación y contratos, webhooks firmados (los de Persat no tienen firma documentada) y OT con prioridad y SLA.

## 6. Relevamiento de la cuenta real (2 de octubre de 2026)

Con `npm run persat:relevar` (solo lectura). Lo que se usa de verdad:

- **Volumen:** 658 órdenes en 90 días (unas 220 por mes), 194 clientes distintos atendidos, 3 técnicos, 5 usuarios.
- **Un solo tipo de orden** ("Servicio para Técnicos", 12 versiones, 60 min por defecto). La clase de trabajo va en un desplegable "Tipo de tarea": mantenimiento de equipos propios (37 %), toma de contador (20 %), reemplazo de insumos (14 %), diagnóstico (7 %), mantenimiento de equipos de terceros (5 %), asistencia remota (4 %), entrega de equipos (4 %).
- **Instrucciones:** tipo de tarea, fecha y hora de asignación, equipo del cliente, detalle del inconveniente.
- **Devolución del técnico:** estado (realizado, parcial, pendiente), hora de llegada y de fin, contador, cantidad de tóner por color (amarillo, cian, magenta, negro), fotos, trabajos realizados (toma de medidor, mantenimiento, reparación, diagnóstico, otro), detalle, tareas pendientes, equipos recibidos (cable 220 V, cable de red, tóner genérico, hoja), firma y aclaración.
- **Etiquetas:** "Servicio contrato" (83 % de las órdenes), "Servicio a tercero" (17 %), "Urgente" y "Capacitación" casi sin uso. Cada orden lleva una.
- **Estados:** 505 cerradas OK, 7 con desvío, 12 no cumplidas, 3 canceladas, 17 vencidas, 2 asignadas y **112 en informe sin revisar** (17 %): el cierre del supervisor se acumula.
- **No usan:** preventivo (0 órdenes repetitivas), entregas (2 de prueba en 2024), formularios sueltos (0 en 90 días), rastreo de dispositivos (0), grupos de clientes (uno solo). Varios técnicos por orden: 3 de 658.
- **Clientes:** razón social, dirección y ubicación en el mapa; campos propios Nombre, Email, Teléfono, Localidad y Anotaciones; 9 tipos (cliente grande, mediano, chico, estación de servicio, oficina, garage…). **No tienen CUIT**: para unirlos con los clientes del ERP hay que emparejar por nombre.
- **Equipos (objetos en cliente):** una sola plantilla con "Serie - Modelo" en un mismo texto, "Contador" (texto) y "Ubicación".
- **Catálogo:** "Listado recepción equipo" (código y detalle).
- **Zonas:** 16, por ciudad (Córdoba, GBA Norte/Oeste/Sur, Rosario, Mendoza, Tucumán, Corrientes, Resistencia…).

Consecuencias para el ERP:

1. **El importador es lo primero:** clientes emparejados por nombre con los del ERP (los que no coinciden se revisan a mano), equipos separando serie y modelo, el contador como lectura, técnicos, etiquetas y el historial de órdenes con su devolución.
2. **El tipo de orden de la cuenta se arma igual en el ERP** con nuestros campos (tabla de tóner por color, trabajos realizados, equipos recibidos, firma).
3. **Toma de contador = 20 % de las visitas:** con los contratos por copia del ERP, el contador cargado en la visita ya factura; y el portal deja que el cliente lo cargue solo, sin visita.
4. ~~Cierre en lote~~ (hecho): las órdenes sin revisar se cierran varias a la vez desde el listado.
5. Lo que no usan (entregas, preventivo por regla, rastreo, grupos) baja de prioridad.

## 7. Migrar desde Persat

`npm run persat:importar -- --empresa <CUIT>` (lee `PERSAT_API_KEY`; Persat solo con GET). Módulos: `src/modulos/importacion/persatApi.ts` (descarga) y `persat.ts` (reglas).

1. **Simular primero** (sin `--aplicar`): hace todo en una transacción que se deshace y muestra el informe: clientes emparejados por código, por nombre, creados y sin pareja (con el motivo), equipos, técnicos, etiquetas y órdenes. La descarga queda en `.data/persat/descarga.json` (fuera de git) y se reusa; borrarla para traer lo nuevo.
2. **Resolver los clientes sin pareja**: `--vincular UID_PERSAT=CODIGO_ERP` (se puede repetir) o `--crear-clientes` (quedan con documento 99 y una nota para completar CUIT y condición de IVA).
3. **Aplicar**: `--aplicar --fotos` (las fotos se bajan al crear cada orden; sus URL duran poco). Se puede correr de nuevo cuantas veces haga falta: actualiza el estado y las respuestas de lo migrado y agrega lo nuevo (sirve para la semana de convivencia de los dos sistemas).

Reglas (de la cuenta real):

- **Clientes**: el `uid_client` de Persat es el código del cliente en PYMEXIS (`terceros.codigo`); se empareja por código si el nombre se parece, "1234 SUCURSAL X" va al cliente 1234, y si no por nombre exacto (sin acentos, puntuación ni forma societaria).
- **Equipos**: "Serie - Modelo" se separa (la serie es la primera palabra, o la última con números si empieza con la marca) y se empareja por serie con el parque instalado; los que faltan se crean como "servicio técnico" con el modelo en las observaciones. Si un equipo pasó por varios clientes, queda el último.
- **Tipo de orden**: se crea "Servicio para Tecnicos" (código `PERSAT`) con los mismos campos; cada campo guarda el identificador de Persat (`p_<id>`), así las respuestas pasan tal cual. El primer número que dice "medidor" o "contador" es un campo de contador: en las órdenes nuevas carga la lectura del equipo.
- **Órdenes**: estado, técnico responsable y acompañantes, etiquetas ("Servicio contrato" → cubierta por el contrato; "Urgente" → urgente), día y hora, duración, llegada, informe, resultado del técnico, contador, trabajos realizados como solución y pendientes y causa de cierre en la nota. Lo que no tiene campo en el ERP (versiones viejas del formulario) queda en las observaciones con su título. El "tipo de tarea" define la clase (mantenimiento y toma de contador → preventivo; insumos; entrega de equipos → instalación; el resto, correctivo).
- **No se migra**: la firma (el campo viejo de Persat no la devuelve por la API: queda "El cliente firmó en Persat"), las lecturas de contador de órdenes viejas (quedan en la orden; no se cargan como lectura porque facturan contratos).
- **Facturación**: una orden cerrada en Persat ya se facturó en el sistema anterior: no aparece "a facturar" ni se puede facturar. Si una orden migrada abierta se cierra en el ERP, se factura normalmente.

Prueba con la cuenta real (2 de octubre de 2026, simulación): 2.131 clientes, 2.501 equipos, 3 técnicos, 4 etiquetas y 15.262 órdenes desde 2018, en unos 2 minutos.

## 8. Cierre en lote

En Servicio técnico, filtrando por "Informe para revisar" (o desde "N para revisar" del encabezado), el listado pasa a tener una casilla por orden. Se marcan las revisadas y se cierran todas juntas:

- **Como propuso el técnico** (por defecto): OK, con desvío o no cumplida. En el desvío y la no cumplida la nota es la que dejó (o "Según el informe del técnico: …" con su resumen). Sin propuesta, OK.
- **Todas OK**: ignora la propuesta.
- La fecha de cierre es la del informe del técnico, no la de hoy.
- **Mandar el resumen a cada cliente** viene apagado (para no mandar correos por órdenes viejas).
- Se ven las 500 más antiguas; las que no se pudieron cerrar se listan con el motivo. Para revisar una en detalle, se abre desde su número.

Al migrar el historial de Persat quedan muchas órdenes que nunca se cerraron (en la prueba con la cuenta real: 629 en informe y 1.809 vencidas desde 2018).
