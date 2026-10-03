CREATE TABLE "recuperaciones_clave" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash_token" text NOT NULL,
	"vence" timestamp with time zone NOT NULL,
	"usada" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recuperaciones_clave_hash_token_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
ALTER TABLE "recuperaciones_clave" ADD CONSTRAINT "recuperaciones_clave_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recuperaciones_clave_usuario_id_index" ON "recuperaciones_clave" USING btree ("usuario_id");