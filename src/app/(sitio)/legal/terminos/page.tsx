import type { Metadata } from 'next'
import Link from 'next/link'

import { TextoLegal } from '@/components/sitio/Legal'
import { MARCA } from '@/lib/marca'
import { DIAS_DE_GRACIA, DIAS_DE_PRUEBA } from '@/lib/planes'

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: `Condiciones de uso del servicio ${MARCA.producto}.`,
  alternates: { canonical: '/legal/terminos' },
}

export default function Terminos() {
  return (
    <TextoLegal titulo="Términos y condiciones" actualizado="3 de octubre de 2026">
      <p>
        Estos términos regulan el uso de {MARCA.producto} (el &quot;Servicio&quot;), prestado por {MARCA.empresa}, CUIT{' '}
        {MARCA.cuit} (&quot;Vektra&quot;). Al crear una cuenta o usar el Servicio, la empresa usuaria (el &quot;Cliente&quot;) los
        acepta.
      </p>
      <h2>1. El Servicio</h2>
      <p>
        Es un sistema de gestión en la nube que se usa por internet, sin instalación. Las funciones disponibles dependen del plan
        y de las aplicaciones contratadas, según se publica en la página de <Link href="/precios">precios</Link>.
      </p>
      <h2>2. Cuenta y usuarios</h2>
      <ul>
        <li>El Cliente es responsable de los usuarios que invita, de sus permisos y de mantener las claves en secreto.</li>
        <li>Los datos cargados deben ser veraces y el Cliente debe tener derecho a usarlos.</li>
        <li>Vektra puede suspender un acceso usado para fines ilícitos o que ponga en riesgo el Servicio.</li>
      </ul>
      <h2>3. Prueba, precios y pagos</h2>
      <ul>
        <li>La prueba gratis dura {DIAS_DE_PRUEBA} días y no requiere medio de pago.</li>
        <li>Los precios están en pesos argentinos, sin IVA, y se facturan por mes o por año por adelantado.</li>
        <li>Los precios de lista pueden actualizarse; se avisa con 30 días de anticipación.</li>
        <li>
          Si un pago vence, el Servicio sigue funcionando {DIAS_DE_GRACIA} días; después queda en modo consulta, sin perder datos,
          hasta regularizarlo.
        </li>
        <li>No hay permanencia mínima. La baja se pide desde el sistema o por contacto y rige al terminar el período pagado.</li>
      </ul>
      <h2>4. Datos del Cliente</h2>
      <ul>
        <li>
          Los datos cargados son del Cliente. Vektra los trata solo para prestar el Servicio (ver la política de privacidad).
        </li>
        <li>El Cliente puede exportarlos en cualquier momento.</li>
        <li>Después de la baja se conservan al menos 12 meses para que pueda recuperarlos; luego se eliminan.</li>
      </ul>
      <h2>5. Facturación electrónica e impuestos</h2>
      <p>
        El Servicio emite comprobantes ante ARCA con el certificado y el punto de venta del Cliente. El Cliente es responsable del
        contenido de sus comprobantes, de sus presentaciones y del cumplimiento de sus obligaciones fiscales. Los cálculos de
        impuestos se basan en la configuración que el Cliente carga.
      </p>
      <h2>6. Disponibilidad y soporte</h2>
      <p>
        Vektra procura que el Servicio esté disponible en todo momento y hace copias de seguridad diarias. Puede haber
        interrupciones por mantenimiento (que se avisan cuando es posible) o por fallas de terceros, como ARCA o las plataformas
        de venta. El soporte se presta por los canales y en los horarios de cada plan.
      </p>
      <h2>7. Integraciones con terceros</h2>
      <p>
        Las conexiones con Mercado Libre, Tienda Nube, WooCommerce, Mercado Pago y otros servicios dependen de esas plataformas y
        de sus condiciones. El Cliente las autoriza y puede desconectarlas cuando quiera.
      </p>
      <h2>8. Responsabilidad</h2>
      <p>
        Vektra responde por la prestación diligente del Servicio. No responde por daños indirectos ni por decisiones tomadas en
        base a datos cargados por el Cliente. Nada de lo anterior limita los derechos que las leyes de defensa del consumidor
        reconocen cuando corresponde.
      </p>
      <h2>9. Arrepentimiento</h2>
      <p>
        Si contrataste como consumidor, podés revocar la contratación dentro de los 10 días desde que la hiciste, sin costo, desde
        el <Link href="/legal/arrepentimiento">botón de arrepentimiento</Link>.
      </p>
      <h2>10. Cambios y ley aplicable</h2>
      <p>
        Estos términos pueden actualizarse; los cambios importantes se avisan por email con 30 días de anticipación. Se rigen por
        las leyes de la República Argentina.
      </p>
    </TextoLegal>
  )
}
