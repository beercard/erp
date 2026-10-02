CREATE TABLE "envios_formulario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer,
	"formulario_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"campos" jsonb NOT NULL,
	"valores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tercero_id" uuid,
	"equipo_id" uuid,
	"orden_id" uuid,
	"origen" text DEFAULT 'oficina' NOT NULL,
	"usuario_id" uuid,
	"usuario_portal_id" uuid,
	"tecnico_id" uuid,
	"estado_id" uuid,
	"nota" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"enviado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "envios_formulario_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "envios_formulario_origen" CHECK ("envios_formulario"."origen" in ('oficina', 'tecnico', 'portal')),
	CONSTRAINT "envios_formulario_borrador" CHECK (("envios_formulario"."enviado" is null) = ("envios_formulario"."numero" is null))
);
--> statement-breakpoint
CREATE TABLE "estados_bandeja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"final" boolean DEFAULT false NOT NULL,
	"inicial" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estados_bandeja_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "estados_bandeja_color" CHECK ("estados_bandeja"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "formularios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"campos" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pide_cliente" boolean DEFAULT true NOT NULL,
	"tecnico" boolean DEFAULT true NOT NULL,
	"portal" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formularios_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "formularios_color" CHECK ("formularios"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "archivos_servicio" ALTER COLUMN "orden_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "archivos_servicio" ADD COLUMN "envio_id" uuid;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_formulario_fk" FOREIGN KEY ("empresa_id","formulario_id") REFERENCES "public"."formularios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_equipo_fk" FOREIGN KEY ("empresa_id","equipo_id") REFERENCES "public"."equipos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios_formulario" ADD CONSTRAINT "envios_formulario_estado_fk" FOREIGN KEY ("empresa_id","estado_id") REFERENCES "public"."estados_bandeja"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "envios_formulario_numero" ON "envios_formulario" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "envios_formulario_empresa_id_estado_id_index" ON "envios_formulario" USING btree ("empresa_id","estado_id");--> statement-breakpoint
CREATE INDEX "envios_formulario_empresa_id_tercero_id_index" ON "envios_formulario" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estados_bandeja_nombre" ON "estados_bandeja" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "formularios_codigo" ON "formularios" USING btree ("empresa_id","codigo");--> statement-breakpoint
ALTER TABLE "archivos_servicio" ADD CONSTRAINT "archivos_servicio_envio_fk" FOREIGN KEY ("empresa_id","envio_id") REFERENCES "public"."envios_formulario"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos_servicio" ADD CONSTRAINT "archivos_servicio_de" CHECK (("archivos_servicio"."orden_id" is null) <> ("archivos_servicio"."envio_id" is null));