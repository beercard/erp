ALTER TABLE "arca_configuracion" ADD COLUMN "clave_pendiente_cifrada" text;--> statement-breakpoint
ALTER TABLE "arca_configuracion" ADD COLUMN "pedido_csr" text;--> statement-breakpoint
ALTER TABLE "arca_configuracion" ADD COLUMN "pedido_creado" timestamp with time zone;