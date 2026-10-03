-- El rol Contador también cierra y reabre períodos por módulo (bloqueo por fecha). Administración no.
UPDATE roles SET permisos = permisos || ARRAY['empresa.bloqueos']
WHERE empresa_id IS NULL AND nombre = 'Contador' AND NOT ('empresa.bloqueos' = ANY(permisos));
