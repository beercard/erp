-- Endurecimiento (revisión de seguridad de octubre de 2026).

-- 1. El mismo cobro de Mercado Pago no se registra dos veces, aunque avise dos veces a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS eventos_suscripcion_referencia_mp
  ON eventos_suscripcion ((detalle->>'referencia'))
  WHERE tipo = 'pago' AND detalle->>'referencia' LIKE 'mp:%';
--> statement-breakpoint

-- 2. La aplicación (erp_app) no puede darse permisos de administrador de la
-- plataforma: eso solo lo hace el dueño de la base (npm run plataforma:admin).
REVOKE UPDATE ON usuarios FROM erp_app;
--> statement-breakpoint
GRANT UPDATE (email, nombre, hash_clave, activo, ultimo_ingreso, actualizado) ON usuarios TO erp_app;
--> statement-breakpoint

-- 3. Grupos de clientes: también presupuestos, pedidos, remitos, contactos,
-- recordatorios, reglas de preventivo y usuarios del portal (por el cliente),
-- y lo que cuelga de órdenes, equipos y contratos (por su padre).
CREATE POLICY visibilidad_grupos ON presupuestos AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON pedidos AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON remitos AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON terceros_contactos AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON recordatorios AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON reglas_preventivo AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON usuarios_portal AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON ordenes_servicio_visitas AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM ordenes_servicio o WHERE o.id = orden_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON ordenes_servicio_items AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM ordenes_servicio o WHERE o.id = orden_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON lecturas AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM equipos e WHERE e.id = equipo_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON facturaciones_contrato AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM contratos c WHERE c.id = contrato_id));
