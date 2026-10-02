/**
 * Lo que tiene que estar configurado para correr en producción. Se controla
 * al arrancar el servidor (src/instrumentation.ts): mejor no levantar que
 * levantar a medias (sin base real, sin poder guardar el certificado de ARCA
 * o con enlaces que apuntan a localhost).
 */
export function problemasDeConfiguracion(env: Record<string, string | undefined> = process.env) {
  const faltan: string[] = []
  const avisos: string[] = []
  if (!env.DATABASE_URL) faltan.push('DATABASE_URL: sin ella usaría una base local de prueba (PGlite).')
  if (!env.APP_URL) faltan.push('APP_URL: la dirección pública (https://…), para los enlaces de los correos.')
  else if (!/^https:\/\//.test(env.APP_URL)) faltan.push('APP_URL tiene que empezar con https://.')
  if ((env.ERP_CLAVE_MAESTRA ?? '').length < 32)
    faltan.push('ERP_CLAVE_MAESTRA: al menos 32 caracteres; cifra los certificados de ARCA y las claves guardadas.')
  if ((env.CRON_SECRET ?? '').length < 16) faltan.push('CRON_SECRET: al menos 16 caracteres; protege la tarea programada.')
  if (!env.SMTP_URL) avisos.push('Sin SMTP_URL los correos quedan en la bandeja de salida sin enviarse.')
  if (env.SMTP_URL && !env.CORREO_REMITENTE) avisos.push('Sin CORREO_REMITENTE los correos salen como no-responder@localhost.')
  if (env.WEBHOOKS_PERMITIR_LOCAL) avisos.push('WEBHOOKS_PERMITIR_LOCAL está puesta: solo debería usarse en desarrollo.')
  return { faltan, avisos }
}
