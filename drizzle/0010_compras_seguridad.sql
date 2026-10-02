-- Etapa 3: aislamiento por empresa de las tablas de compras y pagos.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'ordenes_compra', 'ordenes_compra_items',
  'compras', 'compras_items', 'compras_iva', 'compras_tributos',
  'regimenes_ganancias', 'escala_ganancias', 'retenciones_configuracion',
  'pagos', 'pagos_valores', 'retenciones', 'imputaciones_compras'
]::regclass[]) AS t;
--> statement-breakpoint

-- Un comprobante de compra registrado no se modifica: solo se anula. Lo
-- garantiza la base, no solo la aplicación.
CREATE OR REPLACE FUNCTION erp_compra_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un comprobante de compra no se borra: se anula.' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.estado = 'anulado' THEN
    RAISE EXCEPTION 'El comprobante de compra está anulado.' USING ERRCODE = 'P0001';
  END IF;
  -- La única modificación posible es anularlo.
  IF NEW.estado <> 'anulado'
    OR (to_jsonb(NEW) - ARRAY['estado', 'anulado', 'anulado_por', 'actualizado'])
       <> (to_jsonb(OLD) - ARRAY['estado', 'anulado', 'anulado_por', 'actualizado']) THEN
    RAISE EXCEPTION 'Un comprobante de compra registrado no se modifica: se anula y se carga de nuevo.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER compras_inmutables
  BEFORE UPDATE OR DELETE ON compras
  FOR EACH ROW EXECUTE FUNCTION erp_compra_inmutable();
--> statement-breakpoint

-- El detalle de compras y pagos no cambia nunca.
CREATE OR REPLACE FUNCTION erp_detalle_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El detalle de un comprobante registrado no se modifica.' USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER compras_items_inmutables BEFORE UPDATE OR DELETE ON compras_items
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint
CREATE TRIGGER compras_iva_inmutables BEFORE UPDATE OR DELETE ON compras_iva
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint
CREATE TRIGGER compras_tributos_inmutables BEFORE UPDATE OR DELETE ON compras_tributos
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint
CREATE TRIGGER pagos_valores_inmutables BEFORE UPDATE OR DELETE ON pagos_valores
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint
CREATE TRIGGER retenciones_inmutables BEFORE UPDATE OR DELETE ON retenciones
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint

-- Los pagos se anulan, no se borran; sus valores, retenciones e imputaciones tampoco.
REVOKE DELETE ON compras, compras_items, compras_iva, compras_tributos,
  pagos, pagos_valores, retenciones, imputaciones_compras FROM erp_app;
