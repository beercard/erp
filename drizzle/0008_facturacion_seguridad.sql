-- Etapa 2: aislamiento por empresa de las tablas de facturación y cobranzas.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'arca_configuracion', 'arca_tickets', 'percepciones_iibb',
  'comprobantes', 'comprobantes_items', 'comprobantes_iva', 'comprobantes_tributos', 'comprobantes_asociados',
  'recibos', 'recibos_valores', 'imputaciones'
]::regclass[]) AS t;
--> statement-breakpoint

-- Un comprobante autorizado por ARCA no se modifica ni se borra: se corrige
-- con una nota de crédito. Lo garantiza la base, no solo la aplicación.
CREATE OR REPLACE FUNCTION erp_comprobante_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'autorizado' THEN
    RAISE EXCEPTION 'Un comprobante autorizado no se modifica: se corrige con una nota de crédito.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER comprobantes_inmutables
  BEFORE UPDATE OR DELETE ON comprobantes
  FOR EACH ROW EXECUTE FUNCTION erp_comprobante_inmutable();
--> statement-breakpoint

-- Lo mismo para sus renglones, IVA, tributos y asociados.
CREATE OR REPLACE FUNCTION erp_detalle_comprobante_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado_padre text;
BEGIN
  SELECT estado INTO estado_padre FROM comprobantes WHERE id = OLD.comprobante_id;
  IF estado_padre = 'autorizado' THEN
    RAISE EXCEPTION 'Un comprobante autorizado no se modifica: se corrige con una nota de crédito.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER comprobantes_items_inmutables BEFORE UPDATE OR DELETE ON comprobantes_items
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_comprobante_inmutable();
--> statement-breakpoint
CREATE TRIGGER comprobantes_iva_inmutables BEFORE UPDATE OR DELETE ON comprobantes_iva
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_comprobante_inmutable();
--> statement-breakpoint
CREATE TRIGGER comprobantes_tributos_inmutables BEFORE UPDATE OR DELETE ON comprobantes_tributos
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_comprobante_inmutable();
--> statement-breakpoint
CREATE TRIGGER comprobantes_asociados_inmutables BEFORE UPDATE OR DELETE ON comprobantes_asociados
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_comprobante_inmutable();
--> statement-breakpoint

-- Los recibos se anulan, no se borran; sus valores e imputaciones tampoco.
REVOKE DELETE ON recibos, recibos_valores, imputaciones FROM erp_app;
