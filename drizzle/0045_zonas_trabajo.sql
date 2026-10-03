CREATE TABLE "alertas_zona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"momento" timestamp with time zone NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	CONSTRAINT "alertas_zona_tipo" CHECK ("alertas_zona"."tipo" in ('salida', 'entrada'))
);
--> statement-breakpoint
CREATE TABLE "tecnicos_zonas" (
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"zona_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zonas_trabajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"radio_km" numeric(6, 2) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zonas_trabajo_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "zonas_trabajo_radio" CHECK ("zonas_trabajo"."radio_km" > 0 and "zonas_trabajo"."radio_km" <= 500)
);
--> statement-breakpoint
ALTER TABLE "alertas_zona" ADD CONSTRAINT "alertas_zona_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos_zonas" ADD CONSTRAINT "tecnicos_zonas_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos_zonas" ADD CONSTRAINT "tecnicos_zonas_zona_fk" FOREIGN KEY ("empresa_id","zona_id") REFERENCES "public"."zonas_trabajo"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_zona_empresa_id_tecnico_id_momento_index" ON "alertas_zona" USING btree ("empresa_id","tecnico_id","momento");--> statement-breakpoint
CREATE UNIQUE INDEX "tecnicos_zonas_pk" ON "tecnicos_zonas" USING btree ("empresa_id","tecnico_id","zona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zonas_trabajo_nombre" ON "zonas_trabajo" USING btree ("empresa_id","nombre");