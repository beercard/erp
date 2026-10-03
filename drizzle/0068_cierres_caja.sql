CREATE TABLE "cierres_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"desde" timestamp with time zone NOT NULL,
	"hasta" timestamp with time zone NOT NULL,
	"saldo_inicial" numeric(18, 2) NOT NULL,
	"ingresos" numeric(18, 2) NOT NULL,
	"egresos" numeric(18, 2) NOT NULL,
	"esperado" numeric(18, 2) NOT NULL,
	"contado" numeric(18, 2) NOT NULL,
	"diferencia" numeric(18, 2) NOT NULL,
	"conteo" jsonb,
	"resumen" jsonb NOT NULL,
	"arqueo_id" uuid,
	"observaciones" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cierres_caja_empresa_id_cuenta_id_hasta_index" ON "cierres_caja" USING btree ("empresa_id","cuenta_id","hasta");