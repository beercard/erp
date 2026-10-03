-- CRM: aislamiento por empresa, visibilidad por grupos de clientes y permisos
-- de los roles de fábrica.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'crm_etapas', 'crm_motivos_perdida', 'crm_oportunidades', 'crm_actividades', 'crm_historial'
]::regclass[]) AS t;
--> statement-breakpoint
-- Quien ve solo algunos grupos de clientes ve las oportunidades de esos
-- clientes y los prospectos que todavía no son clientes.
CREATE POLICY visibilidad_grupos ON crm_oportunidades AS RESTRICTIVE
  USING (tercero_id IS NULL OR NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON crm_actividades AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM crm_oportunidades o WHERE o.id = oportunidad_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON crm_historial AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM crm_oportunidades o WHERE o.id = oportunidad_id));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['crm.ver', 'crm.oportunidades', 'crm.configurar']
WHERE empresa_id IS NULL AND nombre = 'Administración' AND NOT ('crm.ver' = ANY(permisos));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['crm.ver', 'crm.oportunidades']
WHERE empresa_id IS NULL AND nombre = 'Ventas' AND NOT ('crm.ver' = ANY(permisos));
