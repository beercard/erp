CREATE TABLE "crm_ajustes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"asignacion" text DEFAULT 'ninguna' NOT NULL,
	"vendedores" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"ultimo_asignado" integer DEFAULT -1 NOT NULL,
	"resumen_diario" boolean DEFAULT true NOT NULL,
	"ultimo_resumen" date,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_ajustes_empresa" UNIQUE("empresa_id"),
	CONSTRAINT "crm_ajustes_asignacion" CHECK ("crm_ajustes"."asignacion" in ('ninguna','rotativa'))
);
--> statement-breakpoint
CREATE TABLE "crm_formularios" (
	"token" text PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"origen" text DEFAULT 'Formulario web' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_formularios_empresa_id_unique" UNIQUE("empresa_id")
);
--> statement-breakpoint
CREATE TABLE "crm_plantillas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"canal" text NOT NULL,
	"asunto" text,
	"texto" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_plantillas_canal" CHECK ("crm_plantillas"."canal" in ('whatsapp','email'))
);
--> statement-breakpoint
ALTER TABLE "crm_historial" DROP CONSTRAINT "crm_historial_tipo";--> statement-breakpoint
ALTER TABLE "crm_formularios" ADD CONSTRAINT "crm_formularios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_plantillas_empresa_id_canal_index" ON "crm_plantillas" USING btree ("empresa_id","canal");--> statement-breakpoint
ALTER TABLE "crm_historial" ADD CONSTRAINT "crm_historial_tipo" CHECK ("crm_historial"."tipo" in ('nota','cambio','llamada','whatsapp','email'));