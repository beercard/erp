-- Cobros online: aislamiento por empresa, visibilidad por grupos de clientes y permisos de los roles de fábrica.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['pasarelas_pago', 'pagos_online']::regclass[]) AS t;
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON pagos_online AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['ventas.pasarelas']
WHERE empresa_id IS NULL AND nombre = 'Administración' AND NOT ('ventas.pasarelas' = ANY(permisos));
