-- Catálogos fiscales con los códigos de ARCA. Son datos globales: los
-- comparten todas las empresas y la aplicación solo los lee. Un cambio de
-- ARCA se aplica con una migración nueva, nunca editando esta.

-- Condición frente al IVA del receptor (CondicionIVAReceptorId, RG 5616).
-- letra_desde_inscripto: la factura que emite un Responsable Inscripto.
INSERT INTO condiciones_iva (codigo, nombre, letra_desde_inscripto) VALUES
  (1, 'IVA Responsable Inscripto', 'A'),
  (4, 'IVA Sujeto Exento', 'B'),
  (5, 'Consumidor Final', 'B'),
  (6, 'Responsable Monotributo', 'A'),
  (7, 'Sujeto No Categorizado', 'B'),
  (8, 'Proveedor del Exterior', 'B'),
  (9, 'Cliente del Exterior', 'E'),
  (10, 'IVA Liberado – Ley N° 19.640', 'B'),
  (13, 'Monotributista Social', 'A'),
  (15, 'IVA No Alcanzado', 'B'),
  (16, 'Monotributo Trabajador Independiente Promovido', 'A');
--> statement-breakpoint
INSERT INTO tipos_documento (codigo, nombre, abreviatura) VALUES
  (80, 'CUIT', 'CUIT'),
  (86, 'CUIL', 'CUIL'),
  (87, 'CDI', 'CDI'),
  (89, 'Libreta de Enrolamiento', 'LE'),
  (90, 'Libreta Cívica', 'LC'),
  (91, 'Cédula extranjera', 'CI ext.'),
  (94, 'Pasaporte', 'Pasaporte'),
  (96, 'DNI', 'DNI'),
  (99, 'Sin identificar', 'Sin id.');
--> statement-breakpoint
INSERT INTO alicuotas_iva (codigo, nombre, porcentaje) VALUES
  (3, '0 %', 0),
  (4, '10,5 %', 10.5),
  (5, '21 %', 21),
  (6, '27 %', 27),
  (8, '5 %', 5),
  (9, '2,5 %', 2.5);
--> statement-breakpoint
INSERT INTO monedas (codigo, iso, nombre, simbolo) VALUES
  ('PES', 'ARS', 'Peso argentino', '$'),
  ('DOL', 'USD', 'Dólar estadounidense', 'US$'),
  ('060', 'EUR', 'Euro', '€');
--> statement-breakpoint
-- Código ISO 3166-2 (sin AR-) y jurisdicción del Convenio Multilateral.
INSERT INTO provincias (codigo, nombre, jurisdiccion_cm) VALUES
  ('C', 'Ciudad Autónoma de Buenos Aires', 901),
  ('B', 'Buenos Aires', 902),
  ('K', 'Catamarca', 903),
  ('X', 'Córdoba', 904),
  ('W', 'Corrientes', 905),
  ('H', 'Chaco', 906),
  ('U', 'Chubut', 907),
  ('E', 'Entre Ríos', 908),
  ('P', 'Formosa', 909),
  ('Y', 'Jujuy', 910),
  ('L', 'La Pampa', 911),
  ('F', 'La Rioja', 912),
  ('M', 'Mendoza', 913),
  ('N', 'Misiones', 914),
  ('Q', 'Neuquén', 915),
  ('R', 'Río Negro', 916),
  ('A', 'Salta', 917),
  ('J', 'San Juan', 918),
  ('D', 'San Luis', 919),
  ('Z', 'Santa Cruz', 920),
  ('S', 'Santa Fe', 921),
  ('G', 'Santiago del Estero', 922),
  ('V', 'Tierra del Fuego', 923),
  ('T', 'Tucumán', 924);
--> statement-breakpoint
-- Roles de sistema, disponibles en todas las empresas.
INSERT INTO roles (empresa_id, nombre, descripcion, permisos) VALUES
  (NULL, 'Dueño', 'Acceso total, incluida la configuración de la empresa y sus usuarios', ARRAY['*']),
  (NULL, 'Administración', 'Ventas, compras, tesorería e impuestos; sin configuración de usuarios',
    ARRAY['maestros.*', 'ventas.*', 'compras.*', 'tesoreria.*', 'stock.*', 'impuestos.*', 'informes.*']),
  (NULL, 'Ventas', 'Clientes, presupuestos, pedidos y facturación',
    ARRAY['maestros.ver', 'maestros.terceros', 'ventas.*', 'stock.ver', 'informes.ventas']),
  (NULL, 'Depósito', 'Stock, remitos y recepción de mercadería',
    ARRAY['maestros.ver', 'stock.*', 'ventas.remitos']),
  (NULL, 'Solo lectura', 'Consulta de todo, sin poder modificar', ARRAY['*.ver']);
