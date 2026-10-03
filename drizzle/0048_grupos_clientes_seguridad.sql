-- Grupos de clientes: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'grupos_clientes', 'usuarios_grupos_clientes'
]::regclass[]) AS t;
--> statement-breakpoint

-- Visibilidad por usuario. La aplicación fija app.usuario_id en la
-- transacción (src/db/empresa.ts). Un usuario con algún grupo asignado en la
-- empresa solo ve los clientes de sus grupos y lo que cuelga de ellos. Sin
-- usuario (procesos automáticos, API, portal) o sin grupos, se ve todo.
-- Los proveedores (aunque también sean clientes) se ven siempre.
CREATE OR REPLACE FUNCTION erp_usuario_restringido() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_grupos_clientes
    WHERE usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid
  )
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_ve_grupo_cliente(grupo uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT NOT erp_usuario_restringido() OR EXISTS (
    SELECT 1 FROM usuarios_grupos_clientes
    WHERE usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid AND grupo_id = grupo
  )
$fn$;
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON terceros AS RESTRICTIVE
  USING (NOT es_cliente OR es_proveedor OR erp_ve_grupo_cliente(grupo_cliente_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON ordenes_servicio AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON contratos AS RESTRICTIVE
  USING (NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON equipos AS RESTRICTIVE
  USING (tercero_id IS NULL OR NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
--> statement-breakpoint
CREATE POLICY visibilidad_grupos ON envios_formulario AS RESTRICTIVE
  USING (tercero_id IS NULL OR NOT erp_usuario_restringido() OR EXISTS (SELECT 1 FROM terceros t WHERE t.id = tercero_id));
