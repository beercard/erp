-- Etapa 6: aislamiento por empresa.
SELECT erp_aislar_por_empresa('presentaciones'::regclass);
--> statement-breakpoint

-- Lo presentado queda como registro: no se borra.
REVOKE DELETE ON presentaciones FROM erp_app;
