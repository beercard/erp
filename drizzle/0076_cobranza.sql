CREATE TABLE "cobranza_configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"recordatorios" boolean DEFAULT false NOT NULL,
	"dias_antes" smallint DEFAULT 3 NOT NULL,
	"etapas" smallint[] DEFAULT '{1,7,15,30}'::smallint[] NOT NULL,
	"por_correo" boolean DEFAULT true NOT NULL,
	"por_whatsapp" boolean DEFAULT false NOT NULL,
	"tasa_mensual" numeric(7, 4),
	"dias_gracia" smallint DEFAULT 0 NOT NULL,
	"minimo_interes" numeric(18, 2) DEFAULT '0' NOT NULL,
	"ultimo_envio" date,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intereses_mora" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"dias" integer NOT NULL,
	"saldo" numeric(18, 2) NOT NULL,
	"tasa_mensual" numeric(7, 4) NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"nota_debito_id" uuid,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordatorios_deuda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"etapa" smallint NOT NULL,
	"via" text NOT NULL,
	"destino" text,
	"enviado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intereses_mora" ADD CONSTRAINT "intereses_mora_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios_deuda" ADD CONSTRAINT "recordatorios_deuda_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobranza_configuracion_empresa_id_index" ON "cobranza_configuracion" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "intereses_mora_empresa_id_comprobante_id_hasta_index" ON "intereses_mora" USING btree ("empresa_id","comprobante_id","hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "recordatorios_deuda_etapa" ON "recordatorios_deuda" USING btree ("empresa_id","comprobante_id","etapa","via");