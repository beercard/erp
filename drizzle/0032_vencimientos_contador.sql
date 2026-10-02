CREATE TABLE "configuracion_impuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"email_contador" text,
	"email_avisos" text,
	"avisar_dias" smallint DEFAULT 3 NOT NULL,
	"paquete_al_presentar" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracion_impuestos_dias" CHECK ("configuracion_impuestos"."avisar_dias" between 0 and 15)
);
--> statement-breakpoint
CREATE TABLE "envios_contador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"periodo" text NOT NULL,
	"para" text NOT NULL,
	"correo_id" uuid,
	"automatico" boolean DEFAULT false NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"impuesto" text NOT NULL,
	"nombre" text NOT NULL,
	"dia" smallint NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligaciones_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "obligaciones_impuesto" CHECK ("obligaciones"."impuesto" in ('iva_digital', 'sicore', 'iibb', 'otro')),
	CONSTRAINT "obligaciones_dia" CHECK ("obligaciones"."dia" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "vencimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"obligacion_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"fecha" date NOT NULL,
	"ajustada" boolean DEFAULT false NOT NULL,
	"cumplida" timestamp with time zone,
	"avisado" timestamp with time zone,
	"avisado_vencido" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correos" ADD COLUMN "adjuntos" jsonb;--> statement-breakpoint
ALTER TABLE "vencimientos" ADD CONSTRAINT "vencimientos_obligacion_fk" FOREIGN KEY ("empresa_id","obligacion_id") REFERENCES "public"."obligaciones"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuracion_impuestos_empresa" ON "configuracion_impuestos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "envios_contador_empresa_id_periodo_index" ON "envios_contador" USING btree ("empresa_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "obligaciones_nombre" ON "obligaciones" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "vencimientos_periodo" ON "vencimientos" USING btree ("empresa_id","obligacion_id","periodo");--> statement-breakpoint
CREATE INDEX "vencimientos_empresa_id_fecha_index" ON "vencimientos" USING btree ("empresa_id","fecha");