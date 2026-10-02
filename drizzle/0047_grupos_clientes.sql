CREATE TABLE "grupos_clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_clientes_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "usuarios_grupos_clientes" (
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	CONSTRAINT "usuarios_grupos_clientes_usuario_id_grupo_id_pk" PRIMARY KEY("usuario_id","grupo_id")
);
--> statement-breakpoint
ALTER TABLE "terceros" ADD COLUMN "grupo_cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "usuarios_grupos_clientes" ADD CONSTRAINT "usuarios_grupos_clientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_grupos_clientes" ADD CONSTRAINT "usuarios_grupos_clientes_grupo_fk" FOREIGN KEY ("empresa_id","grupo_id") REFERENCES "public"."grupos_clientes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grupos_clientes_empresa_id_nombre_index" ON "grupos_clientes" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE INDEX "usuarios_grupos_clientes_empresa_id_usuario_id_index" ON "usuarios_grupos_clientes" USING btree ("empresa_id","usuario_id");--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_grupo_cliente_fk" FOREIGN KEY ("empresa_id","grupo_cliente_id") REFERENCES "public"."grupos_clientes"("empresa_id","id") ON DELETE no action ON UPDATE no action;