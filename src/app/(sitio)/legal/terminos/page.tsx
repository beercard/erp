import type { Metadata } from 'next'
import Link from 'next/link'

import { TextoLegal } from '@/components/sitio/Legal'
import { MARCA } from '@/lib/marca'
import { DIAS_DE_GRACIA, DIAS_DE_PRUEBA } from '@/lib/planes'

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: `Condiciones de contratación y uso del servicio ${MARCA.producto}.`,
  alternates: { canonical: '/legal/terminos' },
}

const SECCIONES = [
  'Definiciones',
  'Aceptación y capacidad',
  'El Servicio',
  'Licencia de uso',
  'Alta, cuenta y usuarios',
  'Uso aceptable',
  'Prueba gratis',
  'Planes, precios y facturación',
  'Falta de pago',
  'Plazo, baja y rescisión',
  'Datos del Cliente',
  'Datos personales',
  'Confidencialidad',
  'Seguridad y copias de resguardo',
  'Disponibilidad, mantenimiento y soporte',
  'Facturación electrónica y obligaciones fiscales',
  'Integraciones con terceros',
  'Funciones con inteligencia artificial',
  'Propiedad intelectual',
  'Responsabilidad',
  'Fuerza mayor',
  'Derechos del consumidor',
  'Comunicaciones',
  'Cambios en los términos',
  'Disposiciones generales',
  'Ley aplicable y jurisdicción',
]

export default function Terminos() {
  let n = 0
  const h = () => {
    const i = n++
    return (
      <h2 id={`s${i + 1}`}>
        {i + 1}. {SECCIONES[i]}
      </h2>
    )
  }
  return (
    <TextoLegal titulo="Términos y condiciones" actualizado="3 de octubre de 2026">
      <p>
        Estos términos y condiciones (los &quot;Términos&quot;) regulan la contratación y el uso de {MARCA.producto}, prestado por{' '}
        {MARCA.empresa}, CUIT {MARCA.cuit} (&quot;Vektra&quot;). Léelos con atención: al registrarte, contratar un plan o usar el
        Servicio, los aceptás en nombre propio y de la empresa que representás.
      </p>
      <nav aria-label="Índice" className="mt-6 rounded-xl border border-borde p-4 text-sm">
        <p className="!mt-0 font-medium !text-texto">Índice</p>
        <ol className="mt-2 grid list-decimal gap-x-6 gap-y-1 pl-5 text-texto-2 sm:grid-cols-2">
          {SECCIONES.map((s, i) => (
            <li key={s} className="!mt-0">
              <a href={`#s${i + 1}`} className="hover:text-acento">
                {s}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {h()}
      <ul>
        <li>
          <strong>Servicio:</strong> el sistema de gestión {MARCA.producto}, sus aplicaciones, su API, el portal de clientes y la
          documentación, accesibles por internet.
        </li>
        <li>
          <strong>Cliente:</strong> la persona humana o jurídica que da de alta una empresa en el Servicio y contrata un plan.
        </li>
        <li>
          <strong>Usuario:</strong> cada persona a la que el Cliente le da acceso (empleados, contador, técnicos, clientes del
          Cliente en el portal).
        </li>
        <li>
          <strong>Datos del Cliente:</strong> toda la información que el Cliente o sus Usuarios cargan, importan o generan en el
          Servicio.
        </li>
        <li>
          <strong>Plan:</strong> la combinación de funciones, aplicaciones, límites y precio elegida por el Cliente, según se
          publica en <Link href="/precios">precios</Link>.
        </li>
      </ul>

      {h()}
      <p>
        Para contratar hay que ser mayor de edad y tener capacidad legal; quien registra una empresa declara tener facultades
        suficientes para obligarla. Si no estás de acuerdo con estos Términos, no uses el Servicio. Las condiciones particulares
        que se acuerden por escrito con un Cliente (por ejemplo, un precio especial) prevalecen sobre estos Términos en lo que
        regulen.
      </p>

      {h()}
      <p>
        El Servicio es un software de gestión en la nube (modalidad &quot;software como servicio&quot;): no se instala, se usa
        desde el navegador y Vektra se ocupa del alojamiento, las actualizaciones y el mantenimiento. Las funciones disponibles
        dependen del Plan contratado. Vektra puede mejorar, modificar o reemplazar funciones; si retira una función esencial de un
        Plan vigente, lo avisa con al menos 30 días de anticipación y el Cliente puede dar de baja el Servicio sin cargo.
      </p>

      {h()}
      <p>
        Mientras el Plan esté vigente, Vektra otorga al Cliente una licencia de uso del Servicio no exclusiva, intransferible y
        limitada a la gestión de su propia empresa. El Cliente no puede revender, sublicenciar ni ceder el acceso a terceros
        ajenos a su organización, salvo lo previsto para su contador y para el portal de sus clientes.
      </p>

      {h()}
      <ul>
        <li>El Cliente debe dar datos verdaderos y completos al registrarse y mantenerlos actualizados.</li>
        <li>
          Cada empresa tiene un código y una dirección propios. El Cliente decide quién entra, con qué rol y qué permisos, y es
          responsable de lo que hagan sus Usuarios.
        </li>
        <li>
          Las claves son personales. El Cliente debe mantenerlas en secreto, activar los resguardos disponibles y avisar a Vektra
          apenas sospeche un uso indebido. Vektra nunca pide claves por email, teléfono ni WhatsApp.
        </li>
        <li>Las claves de la API y los certificados de ARCA tienen el mismo cuidado que una clave de acceso.</li>
      </ul>

      {h()}
      <p>El Cliente se compromete a no usar el Servicio para:</p>
      <ul>
        <li>Actividades ilícitas, emisión de comprobantes falsos o maniobras de evasión.</li>
        <li>Enviar correo o mensajes no solicitados (spam) desde las funciones de comunicación.</li>
        <li>Cargar contenido que infrinja derechos de terceros o datos personales obtenidos sin base legal.</li>
        <li>
          Intentar acceder a datos de otras empresas, probar vulnerabilidades sin autorización escrita, sobrecargar el sistema o
          copiar su funcionamiento con fines competitivos.
        </li>
      </ul>
      <p>
        Ante un incumplimiento grave, Vektra puede suspender el acceso afectado de inmediato y lo informa al Cliente con el
        motivo.
      </p>

      {h()}
      <p>
        La prueba gratis dura {DIAS_DE_PRUEBA} días, no pide medio de pago y no se renueva sola: al terminar, el Cliente elige un
        Plan o la cuenta pasa a modo consulta. Durante la prueba se aplican estos Términos, pero el Servicio se ofrece en el
        estado en que se encuentra.
      </p>

      {h()}
      <ul>
        <li>
          Los precios se publican en pesos argentinos, sin IVA, y se cobran por adelantado por mes o por año, según el ciclo
          elegido.
        </li>
        <li>
          Vektra emite factura electrónica por cada pago a nombre de la empresa registrada y la envía por email al titular de la
          cuenta.
        </li>
        <li>
          El pago puede hacerse por débito automático de Mercado Pago u otros medios que se habiliten. Con débito automático, el
          Cliente autoriza a debitar el importe del Plan en cada período hasta que lo cancele.
        </li>
        <li>
          Los precios de lista pueden actualizarse. Los cambios se avisan por email con al menos 30 días de anticipación y rigen
          desde el período siguiente; si el Cliente no está de acuerdo, puede dar de baja antes de que apliquen.
        </li>
        <li>
          Los cambios de Plan hacia uno superior se aplican al confirmarse el pago; hacia uno inferior, desde el período
          siguiente.
        </li>
        <li>Lo pagado por períodos ya iniciados no se reintegra, salvo lo previsto en el punto 22.</li>
      </ul>

      {h()}
      <p>
        Si un período vence sin pagarse, el Servicio sigue funcionando normalmente durante {DIAS_DE_GRACIA} días. Después queda en
        modo consulta: se puede ver y exportar todo, pero no emitir comprobantes ni cargar operaciones. No se borra ningún dato
        por falta de pago mientras la cuenta no se dé de baja. Al regularizar el pago, todo vuelve a funcionar en el acto.
      </p>

      {h()}
      <ul>
        <li>
          La contratación es por tiempo indeterminado y se renueva sola en cada período. No hay permanencia mínima ni costo de
          baja.
        </li>
        <li>
          El Cliente puede dar de baja el Servicio en cualquier momento desde Configuración → Suscripción (botón &quot;Dar de
          baja&quot;) o desde el formulario de contacto. El débito automático se cancela en el acto, el Servicio sigue funcionando
          hasta el final del período pagado y, hasta esa fecha, la baja se puede deshacer.
        </li>
        <li>
          Vektra puede rescindir con 30 días de aviso, o de inmediato ante un incumplimiento grave de estos Términos que no se
          corrija dentro de los 10 días de notificado.
        </li>
      </ul>

      {h()}
      <ul>
        <li>Los Datos del Cliente son del Cliente. Vektra no los usa para otro fin que prestar el Servicio.</li>
        <li>
          El Cliente puede exportarlos en cualquier momento, en formatos estándar (planillas, archivos de ARCA, PDF), mientras la
          cuenta exista, incluso en modo consulta.
        </li>
        <li>
          Después de la baja, los datos se conservan 12 meses para que el Cliente pueda recuperarlos; luego se eliminan de forma
          segura, salvo lo que la ley obligue a conservar. El Cliente puede pedir que se eliminen antes.
        </li>
        <li>
          Vektra puede usar información agregada y anónima sobre el uso del Servicio (por ejemplo, cuántos comprobantes se emiten)
          para mejorarlo, sin identificar al Cliente ni a sus clientes.
        </li>
      </ul>

      {h()}
      <p>
        Respecto de los datos personales que el Cliente carga sobre sus clientes, proveedores y empleados, el Cliente es el
        responsable del tratamiento y Vektra actúa como encargada, siguiendo sus instrucciones y la Ley 25.326. Vektra solo
        recurre a proveedores necesarios para prestar el Servicio (alojamiento, envío de correo, protección contra ataques) y les
        exige el mismo nivel de resguardo. El detalle está en la <Link href="/legal/privacidad">política de privacidad</Link>.
      </p>

      {h()}
      <p>
        Vektra trata como confidencial toda la información del Cliente y solo permite el acceso de su personal cuando hace falta
        para dar soporte o resolver una falla. El acceso de soporte a la cuenta de una empresa queda registrado, es de solo
        lectura y dura como máximo una hora. Vektra solo entrega información a una autoridad ante una orden legal y, si la ley lo
        permite, se lo avisa al Cliente.
      </p>

      {h()}
      <ul>
        <li>
          Conexión cifrada, datos de cada empresa aislados en la base de datos, certificados y credenciales guardados cifrados,
          permisos por rol y registro de auditoría.
        </li>
        <li>Copias de seguridad diarias y un procedimiento probado para recuperarlas.</li>
        <li>
          Si Vektra detecta un incidente que afecte Datos del Cliente, se lo informa sin demoras injustificadas, con lo que se
          sepa y las medidas tomadas.
        </li>
      </ul>

      {h()}
      <p>
        Vektra hace lo razonable para que el Servicio esté disponible en todo momento. Las tareas de mantenimiento se hacen,
        cuando es posible, fuera del horario comercial y con aviso previo. Puede haber interrupciones por causas ajenas a Vektra
        (ARCA, proveedores de internet, plataformas de terceros). El soporte se brinda por los canales publicados y con los
        alcances de cada Plan; no incluye el asesoramiento contable, impositivo ni legal.
      </p>

      {h()}
      <ul>
        <li>
          El Servicio emite comprobantes ante ARCA con el CUIT, el certificado digital y los puntos de venta del Cliente. El
          Cliente es quien emite: es responsable del contenido de sus comprobantes y de que sus datos fiscales estén al día.
        </li>
        <li>
          Los cálculos de impuestos, percepciones, retenciones, libros y declaraciones que prepara el Servicio se basan en la
          configuración y los datos que carga el Cliente. Conviene que su contador los revise antes de presentarlos.
        </li>
        <li>
          Las funciones automáticas (facturas recurrentes, facturación masiva, API) emiten comprobantes según lo que el Cliente
          configura; el Cliente debe revisar esa configuración y los resultados.
        </li>
        <li>
          Si ARCA no responde, el Servicio guarda el comprobante pendiente y lo verifica después, para no emitir dos veces la
          misma operación.
        </li>
      </ul>

      {h()}
      <p>
        El Cliente puede conectar el Servicio con ARCA, ARBA, Mercado Pago, Payway, GoCuotas, Clover, WhatsApp Business, Mercado
        Libre, Tienda Nube, WooCommerce, Shopify, Magento, PrestaShop y otros. Cada conexión la autoriza el Cliente, con sus
        propias cuentas, y está sujeta a las condiciones de esa plataforma. Vektra no responde por cambios, cortes o decisiones de
        esos terceros, pero hace lo razonable para adaptar las conexiones. El Cliente puede desconectarlas cuando quiera.
      </p>

      {h()}
      <p>
        Algunas funciones usan inteligencia artificial (por ejemplo, leer una factura de compra recibida o responder consultas de
        clientes por WhatsApp). Sus resultados pueden tener errores: los comprobantes leídos quedan como borrador para que el
        Cliente los revise, y el asistente deriva a una persona lo que no puede resolver. Estas funciones se activan solo si el
        Cliente las habilita, y el proveedor de inteligencia artificial que usa Vektra no utiliza esos datos para entrenar sus
        modelos.
      </p>

      {h()}
      <p>
        El software, el diseño, la marca {MARCA.producto} y la documentación son de Vektra o de sus licenciantes. Estos Términos
        no transfieren ninguno de esos derechos. Si el Cliente envía sugerencias, Vektra puede usarlas para mejorar el Servicio
        sin obligación de compensación.
      </p>

      {h()}
      <ul>
        <li>Vektra responde por la prestación diligente del Servicio y por los daños que cause por su culpa.</li>
        <li>
          Vektra no responde por daños indirectos o lucro cesante, ni por decisiones tomadas en base a datos cargados por el
          Cliente, ni por el uso del Servicio contrario a estos Términos o a la configuración recomendada.
        </li>
        <li>
          Fuera de los casos de dolo o culpa grave, la responsabilidad total de Vektra se limita a lo que el Cliente pagó por el
          Servicio en los 12 meses anteriores al hecho.
        </li>
        <li>
          Estas limitaciones no se aplican cuando contradigan derechos irrenunciables del consumidor reconocidos por la ley.
        </li>
      </ul>

      {h()}
      <p>
        Ninguna de las partes responde por incumplimientos causados por hechos imprevisibles o inevitables ajenos a su control
        (catástrofes, cortes generales de energía o comunicaciones, actos de autoridad, caídas de ARCA). La parte afectada debe
        avisar y hacer lo razonable para reducir las consecuencias.
      </p>

      {h()}
      <ul>
        <li>
          Si contrataste como consumidor (Ley 24.240), podés revocar la contratación dentro de los 10 días corridos desde que la
          hiciste, sin costo ni explicación, desde el <Link href="/legal/arrepentimiento">botón de arrepentimiento</Link>; se
          reintegra lo pagado.
        </li>
        <li>
          La baja se pide por el mismo medio en que se contrató, desde el botón &quot;Dar de baja&quot; en Configuración →
          Suscripción, sin trámites adicionales, y se confirma por email.
        </li>
      </ul>

      {h()}
      <p>
        Las comunicaciones de Vektra se envían al email del titular de la cuenta y, cuando corresponde, se muestran dentro del
        sistema; se consideran recibidas al enviarse. El Cliente se comunica con Vektra por el{' '}
        <Link href="/contacto">formulario de contacto</Link> o los canales publicados en el sitio.
      </p>

      {h()}
      <p>
        Vektra puede actualizar estos Términos. Los cambios que afecten derechos u obligaciones del Cliente se avisan por email
        con al menos 30 días de anticipación; si el Cliente no los acepta, puede dar de baja el Servicio sin cargo antes de que
        entren en vigencia. Seguir usando el Servicio después implica aceptarlos. La versión vigente siempre está en esta página.
      </p>

      {h()}
      <ul>
        <li>Si una cláusula fuera inválida, las demás siguen vigentes.</li>
        <li>Que una parte no ejerza un derecho en un momento no implica que renuncie a él.</li>
        <li>
          El Cliente no puede ceder el contrato sin conformidad de Vektra. Vektra puede cederlo a quien continúe el Servicio, con
          aviso previo y manteniendo estas condiciones.
        </li>
      </ul>

      {h()}
      <p>
        Estos Términos se rigen por las leyes de la República Argentina. Ante un desacuerdo, las partes intentarán resolverlo de
        buena fe; si no es posible, serán competentes los tribunales ordinarios correspondientes al domicilio de Vektra, salvo que
        el Cliente sea consumidor, en cuyo caso podrá recurrir a los de su propio domicilio.
      </p>
    </TextoLegal>
  )
}
