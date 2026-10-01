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

## Tokens

Definidos en `src/app/globals.css`:

| Token | Uso |
|---|---|
| `--fondo`, `--superficie`, `--superficie-2` | Fondo de la app, tarjetas y paneles, filas alternas y encabezados |
| `--texto`, `--texto-2`, `--texto-3` | Texto principal, secundario y deshabilitado |
| `--borde` | Divisiones |
| `--acento`, `--acento-suave` | Acciones principales y foco |
| `--ok`, `--aviso`, `--error`, `--info` (y sus versiones `-suave`) | Estados |

Tipografía:
- **IBM Plex Sans** para la interfaz.
- **IBM Plex Mono** para importes, CUIT y números de comprobante, con cifras tabulares.

Las dos familias tienen versiones pensadas para pantallas densas.
