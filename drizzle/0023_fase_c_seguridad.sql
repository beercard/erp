-- Fase C: aislamiento por empresa de las tablas nuevas.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'api_claves', 'webhooks', 'webhook_entregas', 'usuarios_portal', 'sesiones_portal', 'posiciones_tecnicos'
]::regclass[]) AS t;
--> statement-breakpoint

-- Las órdenes que generó un preventivo quedan con ese origen.
UPDATE ordenes_servicio SET origen = 'preventivo' WHERE preventivo_id IS NOT NULL;
--> statement-breakpoint

-- Una clave de la API se revoca, no se borra (queda quién la creó y cuándo se usó).
REVOKE DELETE ON api_claves FROM erp_app;
