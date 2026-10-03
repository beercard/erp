-- WhatsApp: aislamiento por empresa, visibilidad por grupos de clientes y permisos de los roles de fábrica.
SELECT erp_aislar_por_empresa(t)
FROM unnest(ARRAY['whatsapp_cuentas', 'whatsapp_autorizados', 'whatsapp_conversaciones', 'whatsapp_mensajes', 'facturas_recibidas']::regclass[]) AS t;
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON whatsapp_conversaciones AS RESTRICTIVE
  USING (tercero_id IS NULL OR NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON whatsapp_mensajes AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM whatsapp_conversaciones c WHERE c.id = conversacion_id));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['whatsapp.atender', 'whatsapp.configurar']
WHERE empresa_id IS NULL AND nombre = 'Administración' AND NOT ('whatsapp.atender' = ANY(permisos));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['whatsapp.atender']
WHERE empresa_id IS NULL AND nombre = 'Ventas' AND NOT ('whatsapp.atender' = ANY(permisos));
