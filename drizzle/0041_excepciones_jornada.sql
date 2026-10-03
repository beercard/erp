CREATE TABLE "excepciones_jornada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"tipo" text DEFAULT 'ausencia' NOT NULL,
	"jornada_desde" text,
	"jornada_hasta" text,
	"motivo" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excepciones_jornada_tipo" CHECK ("excepciones_jornada"."tipo" in ('ausencia', 'horario')),
	CONSTRAINT "excepciones_jornada_fechas" CHECK ("excepciones_jornada"."hasta" >= "excepciones_jornada"."desde"),
	CONSTRAINT "excepciones_jornada_horario" CHECK ("excepciones_jornada"."tipo" = 'ausencia' or ("excepciones_jornada"."jornada_desde" ~ '^[0-2][0-9]:[0-5][0-9]$' and "excepciones_jornada"."jornada_hasta" ~ '^[0-2][0-9]:[0-5][0-9]$' and "excepciones_jornada"."jornada_hasta" > "excepciones_jornada"."jornada_desde"))
);
--> statement-breakpoint
ALTER TABLE "excepciones_jornada" ADD CONSTRAINT "excepciones_jornada_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "excepciones_jornada_empresa_id_desde_hasta_index" ON "excepciones_jornada" USING btree ("empresa_id","desde","hasta");