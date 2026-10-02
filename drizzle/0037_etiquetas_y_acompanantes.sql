CREATE TABLE "etiquetas_servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etiquetas_servicio_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "etiquetas_servicio_color" CHECK ("etiquetas_servicio"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "ordenes_servicio_etiquetas" (
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordenes_servicio_tecnicos" (
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"tecnico_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ordenes_servicio_etiquetas" ADD CONSTRAINT "ordenes_servicio_etiquetas_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_etiquetas" ADD CONSTRAINT "ordenes_servicio_etiquetas_etiqueta_fk" FOREIGN KEY ("empresa_id","etiqueta_id") REFERENCES "public"."etiquetas_servicio"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_tecnicos" ADD CONSTRAINT "ordenes_servicio_tecnicos_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_tecnicos" ADD CONSTRAINT "ordenes_servicio_tecnicos_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "etiquetas_servicio_nombre" ON "etiquetas_servicio" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_servicio_etiquetas_pk" ON "ordenes_servicio_etiquetas" USING btree ("empresa_id","orden_id","etiqueta_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_etiquetas_empresa_id_etiqueta_id_index" ON "ordenes_servicio_etiquetas" USING btree ("empresa_id","etiqueta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_servicio_tecnicos_pk" ON "ordenes_servicio_tecnicos" USING btree ("empresa_id","orden_id","tecnico_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_tecnicos_empresa_id_tecnico_id_index" ON "ordenes_servicio_tecnicos" USING btree ("empresa_id","tecnico_id");