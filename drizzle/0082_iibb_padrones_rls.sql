-- Padrones de IIBB y acceso a ARBA: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['padron_iibb', 'arba_configuracion']::regclass[]) AS t;
