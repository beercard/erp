-- Etapa 7: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'configuracion_contable', 'cuentas_contables', 'imputaciones_contables', 'ejercicios', 'asientos', 'asientos_lineas'
]::regclass[]) AS t;
--> statement-breakpoint

-- Un asiento no se borra ni se le cambian las líneas: se anula con un contraasiento.
REVOKE DELETE ON asientos, asientos_lineas FROM erp_app;
--> statement-breakpoint
REVOKE UPDATE ON asientos_lineas FROM erp_app;
--> statement-breakpoint

-- Partida doble: al terminar la transacción, cada asiento tocado tiene al menos dos líneas y debe = haber.
CREATE FUNCTION erp_asiento_balanceado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d numeric;
  h numeric;
  n integer;
BEGIN
  SELECT coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*) INTO d, h, n
    FROM asientos_lineas WHERE asiento_id = NEW.asiento_id;
  IF n < 2 OR d <> h THEN
    RAISE EXCEPTION 'El asiento no balancea: debe %, haber % (% líneas)', d, h, n USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER asientos_lineas_balance
  AFTER INSERT ON asientos_lineas DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION erp_asiento_balanceado();
