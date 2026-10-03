-- Facturas recurrentes y lotes: aislamiento por empresa. facturas_suscripcion es de plataforma.
SELECT erp_aislar_por_empresa('facturas_recurrentes'::regclass);
--> statement-breakpoint
SELECT erp_aislar_por_empresa('lotes_facturacion'::regclass);
