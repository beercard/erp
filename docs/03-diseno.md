# Diseño de la interfaz

El ERP lo usa la misma gente varias horas por día, así que la prioridad es la velocidad para el que ya sabe usarlo, sin perder claridad para el que recién empieza.

## Principios

1. **Teclado primero.**
   - `Ctrl + K` abre la **búsqueda universal**: clientes, artículos, comprobantes y acciones ("Nueva factura"). Reemplaza al F4 y al F12 de PYMEXIS.
   - Los formularios se recorren con Tab y se graban con `Ctrl + Enter`.
   - Las tablas se navegan con flechas.
2. **Densidad legible.**
   - Las tablas muestran mucho dato con buena jerarquía: números alineados a la derecha con cifras tabulares, y los textos secundarios en gris.
   - Hay dos alturas de fila, cómoda y compacta, para que cada usuario elija.
3. **El estado se ve sin leer.** Cada estado tiene su chip con color e ícono: emitido, anulado, vencido, pendiente, en cartera, conciliado.
4. **Primero el resumen, después el detalle.** Cada ficha (cliente, artículo, comprobante) abre con lo importante: saldo, deuda vencida, stock y últimas operaciones. El detalle va en pestañas.
5. **Nada se pierde.**
   - Los formularios avisan antes de salir sin grabar.
   - Cada acción irreversible (emitir, anular) pide confirmación dentro de la pantalla.
6. **Mensajes en el idioma del usuario.** Los errores dicen qué pasó y cómo seguir: "El CUIT 20-12345678-9 no es válido: el dígito verificador debería ser 6". Nunca un código técnico solo.
7. **Claro y oscuro.** Los dos temas se diseñan con los mismos tokens.
8. **Celular para consultar.** Saldos, stock, precios y aprobaciones tienen que funcionar en el teléfono. La carga intensiva se piensa para escritorio.

## Referencia y criterios

La referencia es **Odoo** (aplicaciones con color propio, lanzador de aplicaciones, migas, listas densas) llevada a un estilo actual y sobrio, tipo Linear o Stripe: neutros fríos, un solo color de acento (el petróleo de la marca), bordes finos, sombras mínimas y mucho aire alrededor de los títulos. Prácticas que se siguen:

- **Jerarquía clara:** un título por pantalla, la bajada en gris, la acción principal arriba a la derecha y en color; el resto, secundaria.
- **Contraste AA** en los dos temas para el texto; los colores de aplicación solo en íconos y fondos suaves.
- **El estado nunca solo por color:** los chips llevan punto y texto; los avisos, ícono.
- **Foco visible** en todo lo que se toca con el teclado (anillo del acento en los campos).
- **Objetivos táctiles** de 32 px o más en el menú y de 36 px en botones y campos.
- **Movimiento mínimo** (aparición de menús de 140 ms) y nada cuando el sistema pide reducir movimiento.

### Librerías

Se evaluaron Radix/shadcn, Headless UI y Mantine. No se sumaron: Tailwind 4 con tokens propios y unos pocos componentes en `src/components/ui.tsx` alcanzan, y evitan dependencias y peso en cada pantalla. Se usan **lucide-react** (íconos), **cmdk** (búsqueda universal) y **Inter** (fuente, por `next/font`, sin pedidos a terceros en el navegador). Para trabajar el diseño con Claude conviene el plugin **frontend-design** y el plugin **Design** (crítica, sistema de diseño y revisión de accesibilidad).

## Marco de la aplicación

- **Menú lateral** (`src/components/shell/Navegacion.tsx`): áreas con su ícono de color, que se pliegan y se recuerdan por navegador. Lo que el rol no permite no aparece; lo que el plan no incluye se ve con candado solo para quien administra la suscripción. Los datos del menú están en `src/components/shell/menu.ts` y los usan también el lanzador y las migas.
- **Barra superior:** migas (área › pantalla), la búsqueda universal (`Ctrl + K`), el **lanzador de aplicaciones** (`Lanzador.tsx`, la grilla de íconos de Odoo) y el **menú de la persona** (`MenuUsuario.tsx`): cambiar de empresa, administración de la plataforma y el **tema** (automático, claro u oscuro; se guarda en el navegador y se aplica antes de pintar, sin parpadeo).
- **Celular:** el menú lateral se abre como cajón desde la izquierda.
- **Pantallas de acceso** (ingreso, registro, recuperar la clave, invitaciones): `src/components/MarcoAcceso.tsx`, formulario a la izquierda y la marca a la derecha.

## Componentes base (`src/components/ui.tsx`)

| Componente             | Uso                                                                           |
| ---------------------- | ----------------------------------------------------------------------------- |
| `Boton`, `BotonEnlace` | Variantes `primario` (una por pantalla), `secundario`, `fantasma` y `peligro` |
| `Campo`, `Selector`    | Etiqueta arriba, ayuda o error abajo, anillo de foco                          |
| `Chip`                 | Estados, con punto de color                                                   |
| `Panel`                | Tarjetas y contenedores de listas                                             |
| `EncabezadoPagina`     | Título, bajada y acciones de cada pantalla                                    |
| `Aviso`                | Mensajes de error, éxito, advertencia o información, con ícono                |
| `Vacio`                | Lista sin datos: qué es y cómo empezar                                        |
| `Tecla`                | Atajos de teclado                                                             |

Las tablas dentro de `main.contenido` toman solas el encabezado gris claro y el resaltado de fila al pasar (`globals.css`); los buscadores de las listas (`form[role=search]`) muestran la lupa sin tocar cada pantalla.

## Tokens

Definidos en `src/app/globals.css`:

| Token                                                                                                                         | Uso                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--fondo`, `--lateral`, `--superficie`, `--superficie-2`                                                                      | Fondo de la app, menú lateral, tarjetas y paneles, encabezados y filas al pasar |
| `--texto`, `--texto-2`, `--texto-3`                                                                                           | Texto principal, secundario y deshabilitado                                     |
| `--borde`, `--borde-fuerte`                                                                                                   | Divisiones; borde de campos y botones                                           |
| `--acento`, `--acento-hover`, `--acento-suave`, `--anillo`                                                                    | Acciones principales, selección y foco                                          |
| `--ok`, `--aviso`, `--error`, `--info` (y sus versiones `-suave`)                                                             | Estados                                                                         |
| `--sombra-xs`, `--sombra`, `--sombra-lg`                                                                                      | Campos y tarjetas; tarjetas al pasar; menús flotantes                           |
| `--app-*` (maestros, ventas, facturación, compras, tesorería, impuestos, contabilidad, contratos, servicio, tiendas, ajustes) | Color de cada área, igual en los dos temas                                      |
| `--marca`, `--marca-2`                                                                                                        | Paño de la marca en las pantallas de acceso                                     |

En Tailwind se usan como `bg-superficie`, `text-texto-2`, `border-borde-fuerte`, `shadow-suave`, `shadow-panel`, `shadow-flotante`, `bg-app-ventas/14`, etc. Un color suelto en un componente rompe el tema oscuro.

Tipografía:

- **Inter** para la interfaz, con cifras tabulares y cero con barra en importes, CUIT y números de comprobante (clase `cifras`).
- **IBM Plex Mono** queda disponible (`font-mono`) para códigos técnicos.
