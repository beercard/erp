# CRM: embudo de ventas

El CRM sigue cada venta posible desde el primer contacto hasta el presupuesto. Viene con la función **Ventas y CRM** (`comercial`), incluida en todos los planes pagos.

Referencias de diseño:

- **Odoo CRM**: embudo en tablero, barra de etapas en la ficha y actividades con vencimiento.
- **Frappe CRM, EspoCRM y Twenty**: se analizaron sus funciones. Los cuatro proyectos de referencia son AGPL-3.0, así que **no se copió código**: solo se tomaron ideas de funcionamiento.

## Qué hay

| Pantalla        | Ruta                 | Para qué                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embudo          | `/crm`               | Una columna por etapa: total en juego, porcentaje de la etapa y una barra con el estado de las actividades (vencidas, para hoy, agendadas). Se arrastran las tarjetas; en el celular o con teclado, cada tarjeta tiene "Mover a…". Con el **+** de cada columna se da de alta una oportunidad sin salir del tablero. Filtros: búsqueda, "Mías" y por responsable. |
| Ficha           | `/crm/[id]`          | Barra de etapas para tocar, botones Nuevo presupuesto, Ganada, Perdida y Reabrir. Muestra datos y contacto (llamar, WhatsApp, email), próximo paso, aviso de posibles duplicados, actividades e historial con notas.                                                                                                                                              |
| Lista           | `/crm/lista`         | Abiertas, ganadas, perdidas o todas; solo mías; filtro por etiqueta.                                                                                                                                                                                                                                                                                              |
| Mis actividades | `/crm/actividades`   | Vencidas, para hoy y próximas, de uno o de todo el equipo; se marcan hechas desde ahí.                                                                                                                                                                                                                                                                            |
| Pronóstico      | `/crm/pronostico`    | Embudo en juego y ponderado, ganado, tasa de cierre, ticket y días promedio de cierre. También cierres esperados por mes, resultados por responsable, motivos de pérdida y en qué etapa se pierden, y ventas por origen.                                                                                                                                          |
| Configuración   | `/crm/configuracion` | Etapas (nombre, probabilidad, días de alerta, etapa ganada, orden) y motivos de pérdida.                                                                                                                                                                                                                                                                          |

La ficha del cliente (`/terceros/[id]`) muestra sus oportunidades.

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
- **RLS por empresa** en las cinco tablas (`drizzle/0059_crm_seguridad.sql`).
- **Visibilidad por grupos de clientes:** quien ve solo algunos grupos ve las oportunidades de esos clientes y los prospectos que todavía no son clientes. Las actividades y el historial siguen a su oportunidad.

## Código

- Tablas: `src/db/schema/crm.ts` (`crm_etapas`, `crm_motivos_perdida`, `crm_oportunidades`, `crm_actividades`, `crm_historial`).
- Lógica: `src/modulos/crm/crm.ts`. Pruebas: `src/modulos/crm/crm.test.ts`.
- Pantallas y acciones: `src/app/(app)/crm/`.

## Para más adelante

Ideas que surgieron del análisis y quedan pendientes:

- Recordatorios por email de actividades vencidas (con la tarea periódica).
- Reglas de asignación automática (rotativa) para oportunidades que entran por la web o WhatsApp.
- Formulario web que cree oportunidades.
- Vistas guardadas y acciones masivas en la lista.
- Tiempo de primera respuesta.
