-- Fichadas y geocercas: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['fichadas', 'eventos_geocerca']::regclass[]) AS t;
--> statement-breakpoint

-- Una fichada es un registro de horario: no se corrige ni se borra desde la aplicación.
REVOKE UPDATE, DELETE ON fichadas FROM erp_app;
