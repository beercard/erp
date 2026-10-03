ALTER TABLE "arca_configuracion" ADD COLUMN "regimen_clase_a" text DEFAULT 'comun' NOT NULL;--> statement-breakpoint
ALTER TABLE "arca_configuracion" ADD COLUMN "cbu_informada" text;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "leyenda" text;--> statement-breakpoint
ALTER TABLE "arca_configuracion" ADD CONSTRAINT "arca_regimen_clase_a" CHECK ("arca_configuracion"."regimen_clase_a" in ('comun', 'sujeta_retencion', 'cbu_informada'));