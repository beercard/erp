-- Formularios sueltos: aislamiento por empresa de las tablas nuevas.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'formularios', 'estados_bandeja', 'envios_formulario'
]::regclass[]) AS t;
--> statement-breakpoint

-- Quién lo mandó desde el portal (la tabla de usuarios del portal se declara después en el esquema).
ALTER TABLE envios_formulario ADD CONSTRAINT envios_formulario_usuario_portal_fk
  FOREIGN KEY (empresa_id, usuario_portal_id) REFERENCES usuarios_portal (empresa_id, id) ON DELETE SET NULL (usuario_portal_id);
