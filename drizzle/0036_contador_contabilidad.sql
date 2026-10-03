-- El rol Contador también ve la contabilidad, contabiliza, carga asientos y cierra.
UPDATE roles SET permisos = permisos || ARRAY['contabilidad.ver', 'contabilidad.asientos', 'contabilidad.configurar']
WHERE empresa_id IS NULL AND nombre = 'Contador' AND NOT ('contabilidad.ver' = ANY(permisos));
