CREATE TABLE "posiciones_tecnicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tecnico_id" uuid NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"precision" integer,
	"momento" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones_portal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"vence" timestamp with time zone NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_portal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"hash_clave" text,
	"invitacion_hash" text,
	"invitacion_vence" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_ingreso" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_portal_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "api_claves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"prefijo" text NOT NULL,
	"hash" text NOT NULL,
	"acceso" text DEFAULT 'lectura' NOT NULL,
	"ultimo_uso" timestamp with time zone,
	"revocada" timestamp with time zone,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_claves_acceso" CHECK ("api_claves"."acceso" in ('lectura', 'total'))
);
--> statement-breakpoint
CREATE TABLE "webhook_entregas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"datos" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"respuesta" text,
	"proximo_intento" timestamp with time zone DEFAULT now() NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"entregado" timestamp with time zone,
	CONSTRAINT "webhook_entregas_estado" CHECK ("webhook_entregas"."estado" in ('pendiente', 'entregado', 'fallido'))
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] NOT NULL,
	"secreto" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"descripcion" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "webhooks_url" CHECK ("webhooks"."url" ~ '^https?://')
);
--> statement-breakpoint
ALTER TABLE "lecturas" DROP CONSTRAINT "lecturas_origen";--> statement-breakpoint
ALTER TABLE "equipos" ADD COLUMN "lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "equipos" ADD COLUMN "lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "configuracion_servicio" ADD COLUMN "portal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_servicio" ADD COLUMN "portal_ordenes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_servicio" ADD COLUMN "portal_contadores" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion_servicio" ADD COLUMN "portal_color" text DEFAULT '#0f766e' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "origen" text DEFAULT 'oficina' NOT NULL;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD COLUMN "lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "partida_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "tecnicos" ADD COLUMN "partida_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "tipos_orden" ADD COLUMN "portal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posiciones_tecnicos" ADD CONSTRAINT "posiciones_tecnicos_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones_portal" ADD CONSTRAINT "sesiones_portal_usuario_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."usuarios_portal"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_portal" ADD CONSTRAINT "usuarios_portal_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_webhook_fk" FOREIGN KEY ("empresa_id","webhook_id") REFERENCES "public"."webhooks"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posiciones_tecnicos_empresa_id_tecnico_id_momento_index" ON "posiciones_tecnicos" USING btree ("empresa_id","tecnico_id","momento");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_portal_token" ON "sesiones_portal" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_portal_empresa_id_email_index" ON "usuarios_portal" USING btree ("empresa_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_portal_invitacion" ON "usuarios_portal" USING btree ("invitacion_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "api_claves_hash" ON "api_claves" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "webhook_entregas_empresa_id_estado_proximo_intento_index" ON "webhook_entregas" USING btree ("empresa_id","estado","proximo_intento");--> statement-breakpoint
CREATE INDEX "webhook_entregas_webhook_id_index" ON "webhook_entregas" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhooks_empresa_id_index" ON "webhooks" USING btree ("empresa_id");--> statement-breakpoint
ALTER TABLE "lecturas" ADD CONSTRAINT "lecturas_origen" CHECK ("lecturas"."origen" in ('manual', 'archivo', 'mps', 'pymexis', 'tecnico', 'portal', 'api'));--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_origen" CHECK ("ordenes_servicio"."origen" in ('oficina', 'portal', 'api', 'preventivo'));