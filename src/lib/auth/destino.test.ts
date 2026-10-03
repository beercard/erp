import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './destino'

/**
 * `destinoSeguro` decide adónde se redirige después de ingresar (`?volver=`). Solo acepta rutas internas: cualquier cosa que
 * pueda salir del sitio (open redirect) vuelve a '/'. Es sincrónico a propósito: vive fuera de un archivo 'use server'.
 */
describe('destinoSeguro', () => {
  it('sin destino o vacío vuelve a la raíz', () => {
    expect(destinoSeguro(undefined)).toBe('/')
    expect(destinoSeguro('')).toBe('/')
  })

  it('conserva una ruta interna con su consulta y ancla', () => {
    expect(destinoSeguro('/ventas?x=1#a')).toBe('/ventas?x=1#a')
  })

  it('conserva una ruta interna con segmentos', () => {
    expect(destinoSeguro('/ventas/123')).toBe('/ventas/123')
  })

  it('la raíz queda como raíz', () => {
    expect(destinoSeguro('/')).toBe('/')
  })

  it('rechaza una URL relativa al protocolo (//otro.com)', () => {
    expect(destinoSeguro('//otro.com')).toBe('/')
  })

  it('rechaza la barra seguida de contrabarra (/\\otro.com), que los navegadores tratan como //', () => {
    expect(destinoSeguro('/\\otro.com')).toBe('/')
  })

  it('rechaza una URL absoluta', () => {
    expect(destinoSeguro('https://otro.com')).toBe('/')
  })

  it('rechaza una ruta sin barra inicial', () => {
    expect(destinoSeguro('ventas')).toBe('/')
  })

  it('rechaza espacios y tabulaciones', () => {
    expect(destinoSeguro('/con espacio')).toBe('/')
    expect(destinoSeguro('/a\tb')).toBe('/')
  })

  it('rechaza contrabarras en cualquier parte', () => {
    expect(destinoSeguro('/x\\y')).toBe('/')
  })
})
