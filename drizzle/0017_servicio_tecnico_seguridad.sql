-- Etapa 5: aislamiento por empresa del servicio técnico.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'tecnicos', 'ordenes_servicio', 'ordenes_servicio_visitas', 'ordenes_servicio_items'
]::regclass[]) AS t;
--> statement-breakpoint

-- La factura de la orden. Si se borra el borrador, la orden vuelve a quedar
-- sin facturar (solo se limpia comprobante_id, no empresa_id).
ALTER TABLE ordenes_servicio ADD CONSTRAINT ordenes_servicio_comprobante_fk
  FOREIGN KEY (empresa_id, comprobante_id) REFERENCES comprobantes (empresa_id, id) ON DELETE SET NULL (comprobante_id);
--> statement-breakpoint

-- Las órdenes y sus visitas no se borran: se cancelan.
REVOKE DELETE ON ordenes_servicio, ordenes_servicio_visitas FROM erp_app;
--> statement-breakpoint

-- Rol de sistema para el técnico: ve el parque, carga lecturas y trabaja las órdenes.
INSERT INTO roles (empresa_id, nombre, descripcion, permisos) VALUES
  (NULL, 'Técnico', 'Órdenes de servicio, insumos usados y lecturas de los equipos',
    ARRAY['maestros.ver', 'stock.ver', 'contratos.ver', 'contratos.lecturas', 'servicio.ver', 'servicio.trabajar']);
