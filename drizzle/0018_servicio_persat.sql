CREATE TABLE "archivos_servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"clase" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano" integer NOT NULL,
	"datos" "bytea" NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archivos_servicio_clase" CHECK ("archivos_servicio"."clase" in ('foto', 'firma')),
	CONSTRAINT "archivos_servicio_tipo" CHECK ("archivos_servicio"."tipo_mime" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "archivos_servicio_tamano" CHECK ("archivos_servicio"."tamano" between 1 and 3000000)
);
--> statement-breakpoint
CREATE TABLE "plantillas_orden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"instrucciones" jsonb NOT NULL,
	"devolucion" jsonb NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantillas_orden_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "reglas_preventivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"equipo_id" uuid,
	"tipo_orden_id" uuid NOT NULL,
	"frecuencia" text NOT NULL,
	"cada" integer NOT NULL,
	"desde" date NOT NULL,
	"hora" text,
	"tecnico_id" uuid,
	"ultima_fecha" date,
	"contador_base" bigint,
	"activa" boolean DEFAULT true NOT NULL,
	"observaciones" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reglas_preventivo_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "reglas_preventivo_frecuencia" CHECK ("reglas_preventivo"."frecuencia" in ('semanal', 'mensual', 'copias')),
	CONSTRAINT "reglas_preventivo_cada" CHECK ("reglas_preventivo"."cada" > 0),
	CONSTRAINT "reglas_preventivo_copias_con_equipo" CHECK ("reglas_preventivo"."frecuencia" <> 'copias' or "reglas_preventivo"."equipo_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "tipos_orden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"clase" text DEFAULT 'correctivo' NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"duracion" integer DEFAULT 60 NOT NULL,
	"plazo_horas" integer DEFAULT 48 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_orden_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "tipos_orden_clase" CHECK ("tipos_orden"."clase" in ('correctivo', 'preventivo', 'instalacion', 'retiro', 'insumos')),
	CONSTRAINT "tipos_orden_tiempos" CHECK ("tipos_orden"."duracion" between 5 and 1440 and "tipos_orden"."plazo_horas" between 1 and 720)
);
--> statement-breakpoint
ALTER TABLE "ordenes_servicio" DROP CONSTRAINT "ordenes_servicio_resuelta";--> statement-breakpoint
ALTER TABLE "ordenes_servicio" DROP CONSTRAINT "ordenes_servicio_estado";--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "tipo_orden_id" uuid;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "plantilla_id" uuid;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "instrucciones" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "resultados" jsonb;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "hora" text;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "duracion" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "vence" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "llegada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "llegada_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "llegada_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "salida" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "informada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "cierre_tecnico" text;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "nota_cierre" text;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "cerrada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "cerrada_por" uuid;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "preventivo_id" uuid;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "origen_preventivo" text;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "deposito_id" uuid;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "jornada_desde" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "jornada_hasta" text DEFAULT '17:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "dias" text DEFAULT '12345' NOT NULL;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "partida" text;--> statement-breakpoint
ALTER TABLE "archivos_servicio" ADD CONSTRAINT "archivos_servicio_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_orden" ADD CONSTRAINT "plantillas_orden_tipo_fk" FOREIGN KEY ("empresa_id","tipo_id") REFERENCES "public"."tipos_orden"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_preventivo" ADD CONSTRAINT "reglas_preventivo_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_preventivo" ADD CONSTRAINT "reglas_preventivo_equipo_fk" FOREIGN KEY ("empresa_id","equipo_id") REFERENCES "public"."equipos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_preventivo" ADD CONSTRAINT "reglas_preventivo_tipo_fk" FOREIGN KEY ("empresa_id","tipo_orden_id") REFERENCES "public"."tipos_orden"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_preventivo" ADD CONSTRAINT "reglas_preventivo_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archivos_servicio_empresa_id_orden_id_index" ON "archivos_servicio" USING btree ("empresa_id","orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_orden_empresa_id_tipo_id_version_index" ON "plantillas_orden" USING btree ("empresa_id","tipo_id","version");--> statement-breakpoint
CREATE INDEX "reglas_preventivo_empresa_id_tercero_id_index" ON "reglas_preventivo" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_orden_empresa_id_codigo_index" ON "tipos_orden" USING btree ("empresa_id","codigo");--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_tipo_orden_fk" FOREIGN KEY ("empresa_id","tipo_orden_id") REFERENCES "public"."tipos_orden"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_plantilla_fk" FOREIGN KEY ("empresa_id","plantilla_id") REFERENCES "public"."plantillas_orden"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_preventivo_fk" FOREIGN KEY ("empresa_id","preventivo_id") REFERENCES "public"."reglas_preventivo"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_servicio_preventivo" ON "ordenes_servicio" USING btree ("empresa_id","preventivo_id","origen_preventivo");--> statement-breakpoint
-- Órdenes existentes a los estados nuevos: resuelta pasa a cerrada OK, y una
-- asignada sin día de visita queda pendiente (con su técnico).
UPDATE "ordenes_servicio" SET "estado" = 'cerrada_ok', "cerrada" = "actualizado" WHERE "estado" = 'resuelta';--> statement-breakpoint
UPDATE "ordenes_servicio" SET "estado" = 'pendiente' WHERE "estado" = 'asignada' AND "programada" IS NULL;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_cierre_tecnico" CHECK ("ordenes_servicio"."cierre_tecnico" in ('ok', 'desvio', 'no_cumplida'));--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_cerrada" CHECK (("ordenes_servicio"."estado" like 'cerrada%') = ("ordenes_servicio"."fecha_resolucion" is not null and "ordenes_servicio"."cerrada" is not null));--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_hora" CHECK ("ordenes_servicio"."hora" ~ '^[0-2][0-9]:[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_duracion" CHECK ("ordenes_servicio"."duracion" between 5 and 1440);--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_estado" CHECK ("ordenes_servicio"."estado" in ('pendiente', 'proyectada', 'asignada', 'informe', 'vencida', 'cerrada_ok', 'cerrada_desvio', 'cerrada_no_cumplida', 'cancelada'));--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_jornada" CHECK ("tecnicos"."jornada_desde" ~ '^[0-2][0-9]:[0-5][0-9]$' and "tecnicos"."jornada_hasta" ~ '^[0-2][0-9]:[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_dias" CHECK ("tecnicos"."dias" ~ '^[1-7]{1,7}$');