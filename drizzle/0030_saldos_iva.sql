CREATE TABLE "saldos_iva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"periodo" text NOT NULL,
	"tecnico" numeric(18, 2) DEFAULT '0' NOT NULL,
	"libre" numeric(18, 2) DEFAULT '0' NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saldos_iva_periodo_valido" CHECK ("saldos_iva"."periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "saldos_iva_positivos" CHECK ("saldos_iva"."tecnico" >= 0 and "saldos_iva"."libre" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "saldos_iva_periodo" ON "saldos_iva" USING btree ("empresa_id","periodo");