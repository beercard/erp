-- Cobranza automática: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['cobranza_configuracion', 'recordatorios_deuda', 'intereses_mora']::regclass[]) AS t;
