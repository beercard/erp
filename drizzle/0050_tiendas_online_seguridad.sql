-- Tiendas online: aislamiento por empresa. cuentas_canal es de plataforma
-- (los avisos de Mercado Libre, Tienda Nube y WooCommerce llegan sin sesión
-- y hay que saber de qué empresa son): no lleva RLS y solo guarda el vínculo.
SELECT erp_aislar_por_empresa(t) FROM unnest(ARRAY[
  'canales_venta', 'publicaciones_canal', 'pedidos_canal'
]::regclass[]) AS t;
--> statement-breakpoint
-- Administración y Ventas manejan las tiendas; Ventas solo las ve.
UPDATE roles SET permisos = permisos || ARRAY['tienda.ver', 'tienda.configurar']
WHERE empresa_id IS NULL AND nombre = 'Administración' AND NOT ('tienda.ver' = ANY(permisos));
--> statement-breakpoint
UPDATE roles SET permisos = permisos || ARRAY['tienda.ver']
WHERE empresa_id IS NULL AND nombre = 'Ventas' AND NOT ('tienda.ver' = ANY(permisos));
