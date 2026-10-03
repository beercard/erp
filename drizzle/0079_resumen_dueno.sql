CREATE TABLE "resumen_dueno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"frecuencia" text DEFAULT 'no' NOT NULL,
	"dia_semana" smallint DEFAULT 1 NOT NULL,
	"correos" text[] DEFAULT '{}'::text[] NOT NULL,
	"telefonos" text[] DEFAULT '{}'::text[] NOT NULL,
	"ultimo_envio" date,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumen_dueno_frecuencia" CHECK ("resumen_dueno"."frecuencia" in ('no', 'diario', 'semanal')),
	CONSTRAINT "resumen_dueno_dia" CHECK ("resumen_dueno"."dia_semana" between 1 and 7)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "resumen_dueno_empresa_id_index" ON "resumen_dueno" USING btree ("empresa_id");