# CRM: embudo de ventas

El CRM sigue cada venta posible desde el primer contacto hasta el presupuesto. Viene con la función **Ventas y CRM** (`comercial`), incluida en todos los planes pagos.

Referencias de diseño (se tomaron ideas de funcionamiento, **no código**: Twenty, Frappe CRM, EspoCRM e IDURAR son AGPL-3.0):

- **Odoo CRM**: embudo en tablero, barra de etapas en la ficha y actividades con vencimiento.
- **Twenty**: columnas planas con controles que aparecen al pasar el mouse, alta al pie de la columna, vista rápida en un panel lateral y datos que se editan en el lugar.
- **Frappe CRM**: ficha con columna de datos fija y pestañas de actividad, compositor (nota, llamada, WhatsApp, email), registro rápido de llamadas, plantillas y pie de tarjeta con cuentas.
- **EspoCRM**: formulario web que crea oportunidades, reparto rotativo y la etapa en la que se perdió.

## Qué hay

| Pantalla        | Ruta                 | Para qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embudo          | `/crm`               | Una columna por etapa: total en juego, porcentaje de la etapa y una barra con el estado de las actividades (vencidas, para hoy, agendadas). Se arrastran las tarjetas; en el celular o con teclado, cada tarjeta tiene "Mover a…". Con **+ Nueva** al pie de cada columna se da de alta una oportunidad sin salir del tablero. La tarjeta muestra cuántas notas y actividades tiene. Un clic abre la **vista rápida** (panel a la derecha, `?o=id`, Esc cierra); con Ctrl o Cmd se abre la ficha. Filtros: búsqueda, "Mías" y por responsable. |
| Ficha           | `/crm/[id]`          | Arriba, barra de etapas y botones Nuevo presupuesto, Ganada, Perdida y Reabrir. A la izquierda, columna fija con título, importe, botones de contacto y los datos, que se **editan en el lugar** (Enter guarda, Esc cancela). A la derecha, la actividad: pestañas (Actividad, Notas, Llamadas, Mensajes, Tareas), compositor y línea de tiempo por mes.                                                                                                                                                                                       |
| Lista           | `/crm/lista`         | Abiertas, ganadas, perdidas o todas; solo mías; filtro por etiqueta. Con las casillas (Mayús marca un rango) se mueven de etapa o se reasignan varias a la vez.                                                                                                                                                                                                                                                                                                                                                                                |
| Mis actividades | `/crm/actividades`   | Vencidas, para hoy y próximas, de uno o de todo el equipo; se marcan hechas desde ahí.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pronóstico      | `/crm/pronostico`    | Embudo en juego y ponderado, ganado, tasa de cierre, ticket y días promedio de cierre. También cierres esperados por mes, resultados por responsable, motivos de pérdida y en qué etapa se pierden, y ventas por origen.                                                                                                                                                                                                                                                                                                                       |
| Configuración   | `/crm/configuracion` | Etapas (nombre, probabilidad, días de alerta, etapa ganada, orden), motivos de pérdida, plantillas de WhatsApp y email, reparto de consultas, resumen diario y formulario web.                                                                                                                                                                                                                                                                                                                                                                 |

La ficha del cliente (`/terceros/[id]`) muestra sus oportunidades.

### Compositor de la ficha

- **Nota**: queda en la línea de tiempo.
- **Llamada**: se elige cómo salió (atendió, no atendió, ocupado, dejé mensaje, número equivocado) y qué se habló. Queda como actividad hecha.
- **WhatsApp**: se elige una plantilla o se escribe, y se abre WhatsApp con el texto listo (lo manda la persona desde su teléfono). Queda registrado.
- **Email**: sale por la bandeja de correos de la empresa (la misma de facturas y avisos), con plantilla opcional.
- **Agendar**: llamada, reunión, email, WhatsApp o tarea con fecha y responsable.
- `Ctrl` + `Enter` guarda. Los cambios seguidos de una misma persona en el día se agrupan en una línea que se despliega.

### Atajos de teclado

- En el embudo y la lista: `/` busca y `n` crea una oportunidad.
- En la lista: `j`/`k` (o flechas) recorren, `x` marca, `Enter` abre y `Esc` limpia la selección.
- En la vista rápida: `Esc` la cierra.

### Formulario web

- En Configuración se crea una dirección propia de la empresa (`/api/crm/formulario/<token>`) y se copia el código HTML para pegar en el sitio. También acepta JSON.
- Campos: `nombre` (obligatorio), `empresa`, `email` o `telefono` (uno de los dos), `interes`, `mensaje`. Opcional: `volver`, una dirección `https` a la que vuelve el navegador.
- Cada consulta crea una oportunidad en la primera etapa con la etiqueta "web" y el origen "Formulario web", y agenda "Responder la consulta del sitio" para el día.
- Defensas: campo trampa `web` (si llega completo, se descarta sin avisar), tope de 10 consultas por hora por conexión y token de 24 caracteres al azar. "Cambiar la dirección" invalida la anterior; también se puede apagar.

### Reparto y resumen diario

- **Rotativa:** las consultas del formulario se reparten por turno entre los vendedores elegidos. Sin rotativa, quedan sin asignar.
- **Resumen diario:** la tarea periódica (`/api/cron/servicio`), desde las 8 (hora argentina), manda a cada vendedor un email con sus actividades vencidas y las de hoy. Una vez por día y solo si tiene algo.

## Reglas

- **Etapas de fábrica:** la primera vez se crean Nueva (10 %), Calificada (30 %), Propuesta enviada (60 %), Negociación (80 %) y Ganada (100 %), junto con los motivos de pérdida.
- **Probabilidad:** al cambiar de etapa, la oportunidad toma la probabilidad de la nueva etapa. Se puede corregir a mano.
- **Ganar:** llevar la oportunidad a la etapa marcada como **ganada** la gana y registra la fecha de cierre.
- **Perder:** exige un motivo, y una nota si el motivo es "Otro". La oportunidad conserva la etapa en la que se perdió, para el informe "se pierden en…". Las perdidas no aparecen en el embudo.
- **Estancada:** una oportunidad abierta que pasa los **días de alerta** de su etapa sin moverse se marca en el tablero y en la ficha. Cada cambio de etapa reinicia la cuenta (`etapa_desde`).
- **Sin actividad:** se avisa cuando una oportunidad abierta no tiene nada agendado.
- **Posibles duplicados:** se comparan email, teléfono (últimos 8 dígitos) y nombre de la empresa contra clientes y otras oportunidades abiertas. Con **"Es este cliente"** se vincula la oportunidad sin crear otro cliente.
- **Nuevo presupuesto:**
  - Si es un prospecto, primero lo da de alta como cliente, como consumidor final y sin documento. Los datos fiscales se completan después.
  - Arma el presupuesto con un renglón: el título y el ingreso esperado neto, con IVA 21 %. Hay que completarlo en el editor.
  - Pasa la oportunidad a la primera etapa de 50 % o más (si estaba antes).
- **Importes:** el ingreso esperado acepta "1.800.000", "1.800.000,50" y "1800000.5".

## Permisos y seguridad

- `crm.ver`, `crm.oportunidades` y `crm.configurar`.
  - Administración tiene los tres.
  - Ventas tiene ver y oportunidades.
  - Solo lectura ve.
  - Pasar a presupuesto pide además `ventas.presupuestos`, y dar de alta un cliente pide `maestros.terceros`.
- **RLS por empresa** en las tablas del CRM (`drizzle/0059_crm_seguridad.sql` y `drizzle/0061_crm_v2_seguridad.sql`). `crm_formularios` es de la plataforma: guarda el token de cada empresa y solo se lee fuera de la empresa para recibir consultas.
- El responsable (en la ficha, la edición en línea y las acciones masivas) tiene que ser alguien de la empresa.
- **Visibilidad por grupos de clientes:** quien ve solo algunos grupos ve las oportunidades de esos clientes y los prospectos que todavía no son clientes. Las actividades y el historial siguen a su oportunidad.

## Código

- Tablas: `src/db/schema/crm.ts` (`crm_etapas`, `crm_motivos_perdida`, `crm_oportunidades`, `crm_actividades`, `crm_historial`, `crm_plantillas`, `crm_ajustes`, `crm_formularios`).
- Lógica: `src/modulos/crm/crm.ts` y `src/modulos/crm/extras.ts` (plantillas, llamadas, email, edición en línea, masivas, formulario web, reparto y resumen). Lo que también usa el navegador: `src/modulos/crm/plantillas.ts`. Pruebas: `crm.test.ts` y `extras.test.ts`.
- Pantallas y acciones: `src/app/(app)/crm/`. La ficha y la vista rápida comparten `[id]/Ficha.tsx`.
- Recepción del formulario: `src/app/api/crm/formulario/[token]/route.ts`.

## Para más adelante

Ideas que surgieron del análisis y quedan pendientes:

- Vistas guardadas en la lista.
- Tiempo de primera respuesta.
- Entrada de consultas por WhatsApp (necesita la API oficial de WhatsApp Business).
- Recibir las respuestas de los emails en la ficha (necesita una casilla de entrada).
