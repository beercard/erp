CREATE TABLE "arba_configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"usuario" text NOT NULL,
	"cit" text NOT NULL,
	"ambiente" text DEFAULT 'prueba' NOT NULL,
	"cot_planta" text DEFAULT '000000' NOT NULL,
	"cot_puerta" text DEFAULT '000' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arba_configuracion_ambiente" CHECK ("arba_configuracion"."ambiente" in ('prueba', 'produccion'))
);
--> statement-breakpoint
CREATE TABLE "padron_iibb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"provincia" text NOT NULL,
	"cuit" text NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"percepcion" numeric(18, 4),
	"retencion" numeric(18, 4),
	"grupo_percepcion" text,
	"grupo_retencion" text,
	"origen" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "padron_iibb_origen" CHECK ("padron_iibb"."origen" in ('archivo', 'servicio')),
	CONSTRAINT "padron_iibb_fechas" CHECK ("padron_iibb"."hasta" >= "padron_iibb"."desde")
);
--> statement-breakpoint
ALTER TABLE "articulos" ADD COLUMN "codigo_cot" text;--> statement-breakpoint
ALTER TABLE "articulos" ADD COLUMN "unidad_cot" smallint;--> statement-breakpoint
ALTER TABLE "remitos" ADD COLUMN "cot" text;--> statement-breakpoint
ALTER TABLE "remitos" ADD COLUMN "cot_integridad" text;--> statement-breakpoint
ALTER TABLE "remitos" ADD COLUMN "cot_pedido" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "remitos" ADD COLUMN "patente" text;--> statement-breakpoint
ALTER TABLE "retenciones_configuracion" ADD COLUMN "iibb_activa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "retenciones_configuracion" ADD COLUMN "iibb_provincia" text;--> statement-breakpoint
ALTER TABLE "retenciones_configuracion" ADD COLUMN "iibb_minimo" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "retenciones_configuracion" ADD COLUMN "iibb_alicuota_general" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "padron_iibb" ADD CONSTRAINT "padron_iibb_provincia_provincias_codigo_fk" FOREIGN KEY ("provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arba_configuracion_empresa_id_index" ON "arba_configuracion" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "padron_iibb_vigencia" ON "padron_iibb" USING btree ("empresa_id","provincia","cuit","desde");--> statement-breakpoint
CREATE INDEX "padron_iibb_empresa_id_cuit_index" ON "padron_iibb" USING btree ("empresa_id","cuit");--> statement-breakpoint
ALTER TABLE "retenciones_configuracion" ADD CONSTRAINT "retenciones_configuracion_iibb_provincia_provincias_codigo_fk" FOREIGN KEY ("iibb_provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;