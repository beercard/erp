-- Vencimientos y paquete del contador: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'configuracion_impuestos', 'obligaciones', 'vencimientos', 'envios_contador'
]::regclass[]) AS t;
--> statement-breakpoint

-- Rol de sistema para el estudio contable: ve todo, genera libros e informes, no carga ni modifica operaciones.
INSERT INTO roles (empresa_id, nombre, descripcion, permisos) VALUES
  (NULL, 'Contador', 'Estudio contable: ve las operaciones, genera los libros de IVA, las presentaciones y los informes',
    ARRAY['maestros.ver', 'ventas.ver', 'stock.ver', 'compras.ver', 'tesoreria.ver', 'contratos.ver', 'servicio.ver', 'informes.ver', 'impuestos.libros']);
