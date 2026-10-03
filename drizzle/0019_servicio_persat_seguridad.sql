-- Servicio técnico al estilo Persat: aislamiento por empresa de las tablas nuevas.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'tipos_orden', 'plantillas_orden', 'reglas_preventivo', 'archivos_servicio'
]::regclass[]) AS t;
--> statement-breakpoint

-- Una versión de formularios no se toca: cambiar el formulario crea otra.
-- Las fotos y firmas tampoco: son la constancia de lo que se hizo.
REVOKE UPDATE, DELETE ON plantillas_orden FROM erp_app;
--> statement-breakpoint
REVOKE UPDATE ON archivos_servicio FROM erp_app;
--> statement-breakpoint

-- El rol Técnico ahora también ve su agenda y sube fotos y firmas (servicio.trabajar ya lo tenía).
UPDATE roles SET descripcion = 'Su agenda de órdenes de servicio, devoluciones con fotos y firma, insumos usados y lecturas'
WHERE empresa_id IS NULL AND nombre = 'Técnico';
