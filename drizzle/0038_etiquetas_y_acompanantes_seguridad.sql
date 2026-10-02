-- Etiquetas y acompañantes de las órdenes de servicio: aislamiento por empresa.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'etiquetas_servicio', 'ordenes_servicio_etiquetas', 'ordenes_servicio_tecnicos'
]::regclass[]) AS t;
