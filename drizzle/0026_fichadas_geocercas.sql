CREATE TABLE "eventos_geocerca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"momento" timestamp with time zone NOT NULL,
	"minutos" integer,
	CONSTRAINT "eventos_geocerca_tipo" CHECK ("eventos_geocerca"."tipo" in ('entrada', 'salida'))
);
--> statement-breakpoint
CREATE TABLE "fichadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"precision" integer,
	"usuario_id" uuid,
	CONSTRAINT "fichadas_tipo" CHECK ("fichadas"."tipo" in ('entrada', 'salida'))
);
--> statement-breakpoint
ALTER TABLE "configuracion_servicio" ADD COLUMN "radio_geocerca" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_geocerca" ADD CONSTRAINT "eventos_geocerca_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_geocerca" ADD CONSTRAINT "eventos_geocerca_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichadas" ADD CONSTRAINT "fichadas_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_geocerca_empresa_id_orden_id_momento_index" ON "eventos_geocerca" USING btree ("empresa_id","orden_id","momento");--> statement-breakpoint
CREATE INDEX "eventos_geocerca_empresa_id_tecnico_id_momento_index" ON "eventos_geocerca" USING btree ("empresa_id","tecnico_id","momento");--> statement-breakpoint
CREATE INDEX "fichadas_empresa_id_tecnico_id_momento_index" ON "fichadas" USING btree ("empresa_id","tecnico_id","momento");