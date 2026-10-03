ALTER TABLE "empresas" ADD COLUMN "codigo" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_codigo_unique" UNIQUE("codigo");--> statement-breakpoint
-- Código para las empresas que ya existen: el nombre en minúsculas, sin tildes ni símbolos; si se repite, con -2, -3…
UPDATE "empresas" e SET "codigo" = x.codigo FROM (
  SELECT id, base || CASE WHEN n > 1 THEN '-' || n ELSE '' END AS codigo FROM (
    SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY creado, id) AS n FROM (
      SELECT id, creado, base FROM (
      SELECT id, creado,
        coalesce(nullif(trim(both '-' from left(regexp_replace(
          regexp_replace(lower(translate(coalesce(nullif(nombre_fantasia, ''), razon_social), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')),
            '\s+(s\.?\s?a\.?\s?s?|s\.?\s?r\.?\s?l|s\.?\s?a\.?\s?u|s\.?\s?h|s\.?\s?c\.?\s?a)\.?\s*$', ''),
          '[^a-z0-9]+', '-', 'g'), 30)), ''), 'empresa') AS nombre
      FROM "empresas"
    ) a0
    -- Los códigos reservados (ver src/lib/subdominio.ts) llevan "-empresa".
    CROSS JOIN LATERAL (SELECT CASE WHEN nombre = ANY(ARRAY['www', 'erp', 'app', 'api', 'admin', 'administrador', 'plataforma', 'panel', 'mail', 'correo', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'vpn', 'ns1', 'ns2', 'dns', 'cdn', 'static', 'assets', 'img', 'media', 'blog', 'ayuda', 'soporte', 'help', 'support', 'status', 'estado', 'demo', 'test', 'prueba', 'pruebas', 'dev', 'staging', 'beta', 'vektra', 'ingresar', 'registro', 'login', 'cuenta', 'pago', 'pagos', 'facturacion', 'arca', 'afip', 'seguridad', 'root']) THEN nombre || '-empresa' ELSE nombre END AS base) r
  ) a
  ) b
) x WHERE e.id = x.id AND e."codigo" IS NULL;
