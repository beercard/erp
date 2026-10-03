CREATE TABLE "empresa_marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"logo" "bytea",
	"logo_tipo" text,
	"diseno" text DEFAULT 'clasico' NOT NULL,
	"color" text DEFAULT '#0f766e' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_marca_diseno" CHECK ("empresa_marca"."diseno" in ('clasico', 'moderno', 'compacto')),
	CONSTRAINT "empresa_marca_color" CHECK ("empresa_marca"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "empresa_marca_logo" CHECK ("empresa_marca"."logo_tipo" is null or "empresa_marca"."logo_tipo" in ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_marca_empresa_id_index" ON "empresa_marca" USING btree ("empresa_id");