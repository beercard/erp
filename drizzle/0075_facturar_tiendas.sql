ALTER TABLE "canales_venta" ADD COLUMN "facturar_solo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "canales_venta" ADD COLUMN "cuenta_cobro_id" uuid;--> statement-breakpoint
ALTER TABLE "canales_venta" ADD COLUMN "punto_venta" integer;