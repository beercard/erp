-- Servicio técnico, fase B: aislamiento por empresa de las tablas nuevas.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'configuracion_servicio', 'recordatorios', 'encuestas', 'correos'
]::regclass[]) AS t;
--> statement-breakpoint

-- Lo que se le mandó a un cliente queda: los correos no se borran.
REVOKE DELETE ON correos FROM erp_app;
--> statement-breakpoint
-- Una encuesta respondida no se cambia.
CREATE OR REPLACE FUNCTION erp_encuesta_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.respondida IS NOT NULL THEN
    RAISE EXCEPTION 'La encuesta ya fue respondida.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER encuestas_inmutables
  BEFORE UPDATE OR DELETE ON encuestas
  FOR EACH ROW EXECUTE FUNCTION erp_encuesta_inmutable();
