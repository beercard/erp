CREATE TABLE "configuracion_servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"respuesta_normal" integer DEFAULT 24 NOT NULL,
	"respuesta_urgente" integer DEFAULT 4 NOT NULL,
	"resolucion_normal" integer DEFAULT 72 NOT NULL,
	"resolucion_urgente" integer DEFAULT 24 NOT NULL,
	"email_coordinacion" text,
	"avisar_visita" boolean DEFAULT true NOT NULL,
	"avisar_cierre" boolean DEFAULT true NOT NULL,
	"encuesta" boolean DEFAULT true NOT NULL,
	"firma" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracion_servicio_horas" CHECK (least("configuracion_servicio"."respuesta_normal", "configuracion_servicio"."respuesta_urgente", "configuracion_servicio"."resolucion_normal", "configuracion_servicio"."resolucion_urgente") > 0)
);
--> statement-breakpoint
CREATE TABLE "encuestas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"secreto_hash" text NOT NULL,
	"puntaje" smallint,
	"nps" smallint,
	"comentario" text,
	"respondida" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encuestas_valores" CHECK (("encuestas"."puntaje" between 1 and 5) and ("encuestas"."nps" between 0 and 10)),
	CONSTRAINT "encuestas_respondida" CHECK (("encuestas"."respondida" is null) = ("encuestas"."puntaje" is null))
);
--> statement-breakpoint
CREATE TABLE "recordatorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"equipo_id" uuid,
	"fecha" date NOT NULL,
	"hora" text,
	"titulo" text NOT NULL,
	"detalle" text,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"avisar_a" text,
	"dias_antes" integer DEFAULT 1 NOT NULL,
	"avisado" timestamp with time zone,
	"hecho" timestamp with time zone,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_dias_antes" CHECK ("recordatorios"."dias_antes" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "correos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"para" text NOT NULL,
	"asunto" text NOT NULL,
	"texto" text NOT NULL,
	"entidad" text,
	"entidad_id" uuid,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado" timestamp with time zone,
	CONSTRAINT "correos_estado" CHECK ("correos"."estado" in ('pendiente', 'enviado', 'error'))
);
--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "sla_respuesta_horas" integer;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "sla_resolucion_horas" integer;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "sla_respuesta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "sla_resolucion" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "alerta_sla" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "aviso_visita" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "encuestas" ADD CONSTRAINT "encuestas_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_equipo_fk" FOREIGN KEY ("empresa_id","equipo_id") REFERENCES "public"."equipos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuracion_servicio_empresa_id_index" ON "configuracion_servicio" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "encuestas_empresa_id_orden_id_index" ON "encuestas" USING btree ("empresa_id","orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "encuestas_secreto" ON "encuestas" USING btree ("secreto_hash");--> statement-breakpoint
CREATE INDEX "recordatorios_empresa_id_fecha_index" ON "recordatorios" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "recordatorios_empresa_id_tercero_id_index" ON "recordatorios" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "correos_empresa_id_estado_index" ON "correos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "correos_empresa_id_entidad_entidad_id_index" ON "correos" USING btree ("empresa_id","entidad","entidad_id");