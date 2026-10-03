import type { Metadata } from 'next'
import Link from 'next/link'

import { TextoLegal } from '@/components/sitio/Legal'
import { MARCA } from '@/lib/marca'

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: `Cómo ${MARCA.producto} trata y protege los datos personales.`,
  alternates: { canonical: '/legal/privacidad' },
}

export default function Privacidad() {
  return (
    <TextoLegal titulo="Política de privacidad" actualizado="3 de octubre de 2026">
      <p>
        {MARCA.empresa} (CUIT {MARCA.cuit}) presta {MARCA.producto} y trata datos personales según la Ley 25.326 de Protección de
        los Datos Personales y sus normas complementarias.
      </p>
      <h2>1. Qué datos tratamos</h2>
      <ul>
        <li>De quienes usan el sistema: nombre, email, clave (guardada de forma irreversible) y registros de acceso.</li>
        <li>
          De la empresa cliente: datos fiscales y la información que carga (clientes, proveedores, comprobantes, etc.). Respecto
          de estos datos, el Cliente es el responsable y Vektra actúa como encargada del tratamiento.
        </li>
        <li>De quienes nos escriben desde el sitio: los datos del formulario de contacto.</li>
      </ul>
      <h2>2. Para qué</h2>
      <ul>
        <li>Prestar el Servicio, darte soporte y facturar la suscripción.</li>
        <li>Mantener la seguridad: detectar accesos indebidos y abusos.</li>
        <li>Responder consultas y, si lo aceptás, enviarte novedades (podés darte de baja cuando quieras).</li>
      </ul>
      <p>No vendemos ni alquilamos datos personales.</p>
      <h2>3. Con quién se comparten</h2>
      <p>
        Solo con proveedores necesarios para prestar el Servicio (alojamiento, correo, cobro, la verificación antibots de
        Cloudflare en los formularios públicos y, si la empresa activa las funciones de inteligencia artificial, el proveedor que
        las procesa, que no usa esos datos para entrenar sus modelos) y con los organismos y plataformas que el Cliente conecta
        (ARCA, ARBA, Mercado Libre, Tienda Nube, WooCommerce, Shopify, Magento, PrestaShop, Mercado Pago, WhatsApp), en la medida
        de esa conexión. Algunos de estos proveedores pueden alojar datos fuera de la Argentina; en ese caso se les exige un nivel
        de protección adecuado.
      </p>
      <h2>4. Seguridad</h2>
      <ul>
        <li>Conexión cifrada (HTTPS) y datos de cada empresa aislados de los demás en la base de datos.</li>
        <li>Certificados y claves de integración guardados cifrados.</li>
        <li>Permisos por rol y registro de auditoría de las operaciones.</li>
        <li>Copias de seguridad diarias.</li>
      </ul>
      <h2>5. Cuánto tiempo</h2>
      <p>
        Mientras dure la suscripción y luego el plazo indicado en los <Link href="/legal/terminos">términos</Link>, salvo que la
        ley exija conservarlos más tiempo (por ejemplo, documentación fiscal).
      </p>
      <h2>6. Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación, actualización o supresión de tus datos escribiéndonos desde el{' '}
        <Link href="/contacto">formulario de contacto</Link>. Respondemos dentro de los plazos de la ley (10 días corridos para el
        acceso y 5 días hábiles para la rectificación o supresión).
      </p>
      <p>
        La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución
        de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de
        datos personales.
      </p>
      <h2>7. Cookies</h2>
      <p>
        El sistema usa solo las cookies necesarias para mantener la sesión iniciada. El sitio comercial no usa cookies de
        publicidad.
      </p>
    </TextoLegal>
  )
}
