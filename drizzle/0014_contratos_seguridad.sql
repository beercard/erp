-- Etapa 5: aislamiento por empresa del módulo de contratos.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'modelos_equipo', 'contratos', 'equipos', 'lecturas', 'facturaciones_contrato'
]::regclass[]) AS t;
--> statement-breakpoint

-- Lo facturado de un contrato no se modifica (se anula) y no se borra. Al
-- anularla se suelta la factura si todavía era un borrador (que se borra).
CREATE OR REPLACE FUNCTION erp_facturacion_contrato_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una facturación de contrato no se borra: se anula.' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.estado = 'anulada' THEN
    RAISE EXCEPTION 'La facturación ya está anulada.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado <> 'anulada'
    OR (NEW.comprobante_id IS NOT NULL AND NEW.comprobante_id IS DISTINCT FROM OLD.comprobante_id)
    OR (to_jsonb(NEW) - ARRAY['estado', 'actualizado', 'comprobante_id']) <> (to_jsonb(OLD) - ARRAY['estado', 'actualizado', 'comprobante_id']) THEN
    RAISE EXCEPTION 'Una facturación de contrato no se modifica: se anula.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER facturaciones_contrato_inmutables
  BEFORE UPDATE OR DELETE ON facturaciones_contrato
  FOR EACH ROW EXECUTE FUNCTION erp_facturacion_contrato_inmutable();
--> statement-breakpoint
REVOKE DELETE ON facturaciones_contrato FROM erp_app;
