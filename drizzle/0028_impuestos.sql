CREATE TABLE "presentaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"impuesto" text NOT NULL,
	"periodo" text NOT NULL,
	"secuencia" smallint DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'generada' NOT NULL,
	"archivo" "bytea" NOT NULL,
	"nombre_archivo" text NOT NULL,
	"resumen" jsonb NOT NULL,
	"usuario_id" uuid,
	"presentada" timestamp with time zone,
	"transaccion" text,
	"reabierta" timestamp with time zone,
	"motivo" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentaciones_impuesto" CHECK ("presentaciones"."impuesto" in ('iva_digital', 'sicore', 'iibb')),
	CONSTRAINT "presentaciones_estado" CHECK ("presentaciones"."estado" in ('generada', 'presentada', 'reabierta')),
	CONSTRAINT "presentaciones_periodo" CHECK ("presentaciones"."periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE INDEX "presentaciones_empresa_id_impuesto_periodo_index" ON "presentaciones" USING btree ("empresa_id","impuesto","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "presentaciones_presentada" ON "presentaciones" USING btree ("empresa_id","impuesto","periodo","secuencia") WHERE "presentaciones"."estado" = 'presentada';