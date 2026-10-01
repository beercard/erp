-- Etapa 1: aislamiento por empresa de las tablas del circuito comercial.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'numeradores', 'cotizaciones_empresa', 'presupuestos', 'presupuestos_items',
  'pedidos', 'pedidos_items', 'remitos', 'remitos_items', 'movimientos_stock'
]::regclass[]) AS t;
--> statement-breakpoint

-- Las cotizaciones globales (oficiales) las carga un proceso del sistema, no
-- una empresa: si no, una empresa podría cambiarle el dólar a las demás. La
-- cotización propia de cada empresa va en cotizaciones_empresa.
REVOKE INSERT, UPDATE, DELETE ON cotizaciones FROM erp_app;
--> statement-breakpoint

-- Los movimientos de stock no se modifican ni se borran: se corrigen con otro
-- movimiento (anulación de remito, ajuste).
REVOKE UPDATE, DELETE ON movimientos_stock FROM erp_app;
