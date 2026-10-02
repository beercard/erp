-- Etapa 4: aislamiento por empresa de las tablas de tesorería.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'cuentas_tesoreria', 'movimientos_tesoreria', 'cheques_rechazados', 'arqueos',
  'extractos', 'extractos_lineas', 'conciliaciones'
]::regclass[]) AS t;
--> statement-breakpoint

-- La cuenta por la que entró o salió cada valor tiene que ser de la misma empresa.
ALTER TABLE recibos_valores ADD CONSTRAINT recibos_valores_cuenta_fk
  FOREIGN KEY (empresa_id, cuenta_id) REFERENCES cuentas_tesoreria (empresa_id, id);
--> statement-breakpoint
ALTER TABLE pagos_valores ADD CONSTRAINT pagos_valores_cuenta_fk
  FOREIGN KEY (empresa_id, cuenta_id) REFERENCES cuentas_tesoreria (empresa_id, id);
--> statement-breakpoint

-- Un movimiento de tesorería no se modifica: solo se anula.
CREATE OR REPLACE FUNCTION erp_movimiento_tesoreria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un movimiento de tesorería no se borra: se anula.' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.estado = 'anulado' THEN
    RAISE EXCEPTION 'El movimiento ya está anulado.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado <> 'anulado'
    OR (to_jsonb(NEW) - ARRAY['estado', 'anulado', 'anulado_por', 'actualizado'])
       <> (to_jsonb(OLD) - ARRAY['estado', 'anulado', 'anulado_por', 'actualizado']) THEN
    RAISE EXCEPTION 'Un movimiento de tesorería no se modifica: se anula y se carga de nuevo.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimientos_tesoreria_inmutables
  BEFORE UPDATE OR DELETE ON movimientos_tesoreria
  FOR EACH ROW EXECUTE FUNCTION erp_movimiento_tesoreria_inmutable();
--> statement-breakpoint

-- Arqueos y rechazos de cheques quedan como constancia.
CREATE TRIGGER arqueos_inmutables BEFORE UPDATE OR DELETE ON arqueos
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint
CREATE TRIGGER cheques_rechazados_inmutables BEFORE UPDATE OR DELETE ON cheques_rechazados
  FOR EACH ROW EXECUTE FUNCTION erp_detalle_inmutable();
--> statement-breakpoint

REVOKE DELETE ON movimientos_tesoreria, arqueos, cheques_rechazados FROM erp_app;
