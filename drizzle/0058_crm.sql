CREATE TABLE "crm_actividades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"oportunidad_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"resumen" text NOT NULL,
	"vence" date NOT NULL,
	"responsable_id" uuid,
	"hecha" boolean DEFAULT false NOT NULL,
	"hecha_el" timestamp with time zone,
	"resultado" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_actividades_tipo" CHECK ("crm_actividades"."tipo" in ('llamada','reunion','email','whatsapp','tarea'))
);
--> statement-breakpoint
CREATE TABLE "crm_etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"probabilidad" integer DEFAULT 10 NOT NULL,
	"ganada" boolean DEFAULT false NOT NULL,
	"dias_alerta" integer,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_etapas_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "crm_etapas_probabilidad" CHECK ("crm_etapas"."probabilidad" between 0 and 100),
	CONSTRAINT "crm_etapas_dias_alerta" CHECK ("crm_etapas"."dias_alerta" is null or "crm_etapas"."dias_alerta" > 0)
);
--> statement-breakpoint
CREATE TABLE "crm_historial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"oportunidad_id" uuid NOT NULL,
	"tipo" text DEFAULT 'nota' NOT NULL,
	"texto" text NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_historial_tipo" CHECK ("crm_historial"."tipo" in ('nota','cambio'))
);
--> statement-breakpoint
CREATE TABLE "crm_motivos_perdida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_motivos_perdida_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"titulo" text NOT NULL,
	"tercero_id" uuid,
	"empresa_prospecto" text,
	"contacto" text,
	"email" text,
	"telefono" text,
	"etapa_id" uuid NOT NULL,
	"etapa_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"ingreso_esperado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"probabilidad" integer DEFAULT 10 NOT NULL,
	"cierre_estimado" date,
	"prioridad" integer DEFAULT 0 NOT NULL,
	"responsable_id" uuid,
	"origen" text,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	"descripcion" text,
	"proximo_paso" text,
	"motivo_perdida_id" uuid,
	"nota_perdida" text,
	"presupuesto_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	"cerrada" timestamp with time zone,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_oportunidades_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "crm_oportunidades_estado" CHECK ("crm_oportunidades"."estado" in ('abierta','ganada','perdida')),
	CONSTRAINT "crm_oportunidades_probabilidad" CHECK ("crm_oportunidades"."probabilidad" between 0 and 100),
	CONSTRAINT "crm_oportunidades_prioridad" CHECK ("crm_oportunidades"."prioridad" between 0 and 3),
	CONSTRAINT "crm_oportunidades_ingreso" CHECK ("crm_oportunidades"."ingreso_esperado" >= 0)
);
--> statement-breakpoint
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_oportunidad_fk" FOREIGN KEY ("empresa_id","oportunidad_id") REFERENCES "public"."crm_oportunidades"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_historial" ADD CONSTRAINT "crm_historial_oportunidad_fk" FOREIGN KEY ("empresa_id","oportunidad_id") REFERENCES "public"."crm_oportunidades"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_oportunidades" ADD CONSTRAINT "crm_oportunidades_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE SET NULL ("tercero_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_oportunidades" ADD CONSTRAINT "crm_oportunidades_etapa_fk" FOREIGN KEY ("empresa_id","etapa_id") REFERENCES "public"."crm_etapas"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_oportunidades" ADD CONSTRAINT "crm_oportunidades_motivo_fk" FOREIGN KEY ("empresa_id","motivo_perdida_id") REFERENCES "public"."crm_motivos_perdida"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_oportunidades" ADD CONSTRAINT "crm_oportunidades_presupuesto_fk" FOREIGN KEY ("empresa_id","presupuesto_id") REFERENCES "public"."presupuestos"("empresa_id","id") ON DELETE SET NULL ("presupuesto_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_actividades_empresa_id_oportunidad_id_index" ON "crm_actividades" USING btree ("empresa_id","oportunidad_id");--> statement-breakpoint
CREATE INDEX "crm_actividades_empresa_id_hecha_vence_index" ON "crm_actividades" USING btree ("empresa_id","hecha","vence");--> statement-breakpoint
CREATE INDEX "crm_etapas_empresa_id_orden_index" ON "crm_etapas" USING btree ("empresa_id","orden");--> statement-breakpoint
CREATE INDEX "crm_historial_empresa_id_oportunidad_id_creado_index" ON "crm_historial" USING btree ("empresa_id","oportunidad_id","creado");--> statement-breakpoint
CREATE INDEX "crm_oportunidades_empresa_id_estado_etapa_id_index" ON "crm_oportunidades" USING btree ("empresa_id","estado","etapa_id");--> statement-breakpoint
CREATE INDEX "crm_oportunidades_empresa_id_tercero_id_index" ON "crm_oportunidades" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "crm_oportunidades_empresa_id_responsable_id_index" ON "crm_oportunidades" USING btree ("empresa_id","responsable_id");