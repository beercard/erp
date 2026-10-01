-- Seguridad multiempresa (ver docs/01-arquitectura.md, punto 2).
--
-- La aplicación trabaja con el rol erp_app, que no es dueño de las tablas.
-- Cada tabla de empresa tiene RLS FORZADO: solo ve y acepta filas cuyo
-- empresa_id es el fijado en la transacción (app.empresa_id). Para una tabla
-- nueva de empresa alcanza con: SELECT erp_aislar_por_empresa('tabla');
-- La prueba src/db/seguridad.test.ts falla si alguna quedó sin aislar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    CREATE ROLE erp_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- El usuario con el que se conecta la aplicación pasa a erp_app en cada
-- transacción (SET LOCAL ROLE, src/db/empresa.ts).
GRANT erp_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
--> statement-breakpoint

-- Catálogos fiscales globales: la aplicación solo los lee. Se actualizan con
-- migraciones (las cotizaciones sí las carga la aplicación).
REVOKE INSERT, UPDATE, DELETE ON condiciones_iva, tipos_documento, alicuotas_iva, monedas, provincias FROM erp_app;
--> statement-breakpoint

-- Aislamiento por empresa.
CREATE OR REPLACE FUNCTION erp_aislar_por_empresa(tabla regclass) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  nombre text := tabla::text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabla);
  EXECUTE format('DROP POLICY IF EXISTS aislamiento_empresa ON %s', tabla);
  EXECUTE format(
    $p$CREATE POLICY aislamiento_empresa ON %s
       USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)
       WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)$p$,
    tabla);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = tabla AND conname = nombre || '_empresa_fk'
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (empresa_id) REFERENCES empresas(id)',
      tabla, nombre || '_empresa_fk');
  END IF;
END
$fn$;
--> statement-breakpoint
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'zonas', 'transportes', 'condiciones_pago', 'vendedores', 'depositos', 'puntos_venta',
  'rubros', 'marcas', 'listas_precios', 'articulos', 'precios', 'terceros',
  'terceros_contactos', 'auditoria'
]::regclass[]) AS t;
--> statement-breakpoint

-- Auditoría: solo de agregado, para la aplicación y para cualquiera.
REVOKE UPDATE, DELETE ON auditoria FROM erp_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar';
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION erp_auditoria_inmutable();
