ALTER TABLE "empresas" ADD COLUMN "rubro" text;--> statement-breakpoint
-- Servicio técnico pasa a ser una aplicación aparte de Contratos: quien tenía Contratos sigue con las dos.
UPDATE "suscripciones" SET "aplicaciones" = array_append("aplicaciones", 'servicio')
WHERE 'contratos' = ANY("aplicaciones") AND NOT ('servicio' = ANY("aplicaciones"));
