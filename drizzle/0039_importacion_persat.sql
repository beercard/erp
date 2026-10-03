CREATE TABLE "vinculos_externos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"sistema" text NOT NULL,
	"entidad" text NOT NULL,
	"externo_id" text NOT NULL,
	"erp_id" uuid NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ordenes_servicio" DROP CONSTRAINT "ordenes_servicio_origen";--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_externos_clave" ON "vinculos_externos" USING btree ("empresa_id","sistema","entidad","externo_id");--> statement-breakpoint
CREATE INDEX "vinculos_externos_empresa_id_sistema_entidad_erp_id_index" ON "vinculos_externos" USING btree ("empresa_id","sistema","entidad","erp_id");--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_origen" CHECK ("ordenes_servicio"."origen" in ('oficina', 'portal', 'api', 'preventivo', 'persat'));