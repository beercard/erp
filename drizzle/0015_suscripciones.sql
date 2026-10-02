CREATE TABLE "eventos_suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_suscripcion_tipo" CHECK ("eventos_suscripcion"."tipo" in ('alta', 'cambio', 'pago', 'pedido', 'nota'))
);
--> statement-breakpoint
CREATE TABLE "suscripciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"estado" text NOT NULL,
	"ciclo" text DEFAULT 'mensual' NOT NULL,
	"aplicaciones" text[] DEFAULT '{}'::text[] NOT NULL,
	"usuarios_adicionales" smallint DEFAULT 0 NOT NULL,
	"prueba_hasta" date,
	"pagado_hasta" date,
	"precio_acordado" numeric(18, 2),
	"observaciones" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suscripciones_plan" CHECK ("suscripciones"."plan" in ('gratis', 'inicial', 'pyme', 'empresa')),
	CONSTRAINT "suscripciones_estado" CHECK ("suscripciones"."estado" in ('prueba', 'activa', 'impaga', 'suspendida', 'cancelada')),
	CONSTRAINT "suscripciones_ciclo" CHECK ("suscripciones"."ciclo" in ('mensual', 'anual'))
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "admin_plataforma" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_suscripcion" ADD CONSTRAINT "eventos_suscripcion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_suscripcion" ADD CONSTRAINT "eventos_suscripcion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_suscripcion_empresa_id_creado_index" ON "eventos_suscripcion" USING btree ("empresa_id","creado");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripciones_empresa_id_index" ON "suscripciones" USING btree ("empresa_id");--> statement-breakpoint
-- Las empresas que ya existían quedan en el plan Empresa, activas, con los módulos que tenían como aplicaciones.
INSERT INTO "suscripciones" ("empresa_id", "plan", "estado", "aplicaciones", "observaciones")
SELECT "id", 'empresa', 'activa', "modulos", 'Cliente anterior a los planes' FROM "empresas";--> statement-breakpoint
INSERT INTO "eventos_suscripcion" ("empresa_id", "tipo", "detalle")
SELECT "empresa_id", 'alta', jsonb_build_object('plan', "plan", 'aplicaciones', "aplicaciones") FROM "suscripciones";--> statement-breakpoint
ALTER TABLE "empresas" DROP COLUMN "modulos";