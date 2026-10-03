-- CRM (segunda etapa): plantillas y ajustes aislados por empresa. El vínculo
-- token → empresa del formulario web es de plataforma (crm_formularios): no
-- lleva RLS y solo lo usa la recepción pública y la configuración.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY['crm_plantillas', 'crm_ajustes']::regclass[]) AS t;
