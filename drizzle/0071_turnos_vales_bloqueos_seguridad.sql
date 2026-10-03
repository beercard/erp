-- Turnos de caja, vales y bloqueos por módulo: aislamiento por empresa y permisos de los roles de fábrica.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['turnos_caja', 'vales', 'bloqueos_modulo']::regclass[]) AS t;
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['ventas.supervisar_caja']
WHERE empresa_id IS NULL AND nombre = 'Administración' AND NOT ('ventas.supervisar_caja' = ANY(permisos));
