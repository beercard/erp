-- Zonas de trabajo: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'zonas_trabajo', 'tecnicos_zonas', 'alertas_zona'
]::regclass[]) AS t;
