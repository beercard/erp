CREATE TABLE "invitaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"email" text NOT NULL,
	"rol_id" uuid NOT NULL,
	"hash_token" text NOT NULL,
	"invitado_por" uuid NOT NULL,
	"vence" timestamp with time zone NOT NULL,
	"aceptada" timestamp with time zone,
	"creada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitaciones_hash_token_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_rol_id_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_invitado_por_usuarios_id_fk" FOREIGN KEY ("invitado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitaciones_empresa_id_index" ON "invitaciones" USING btree ("empresa_id");