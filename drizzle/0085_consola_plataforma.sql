CREATE TABLE "auditoria_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"empresa_id" uuid,
	"sobre_usuario_id" uuid,
	"detalle" jsonb,
	"ip" "inet",
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "soporte_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_sobre_usuario_id_usuarios_id_fk" FOREIGN KEY ("sobre_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_plataforma_creado_index" ON "auditoria_plataforma" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "auditoria_plataforma_empresa_id_creado_index" ON "auditoria_plataforma" USING btree ("empresa_id","creado");