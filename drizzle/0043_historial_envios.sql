CREATE TABLE "historial_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"envio_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"color" text NOT NULL,
	"nota" text,
	"autor" text NOT NULL,
	"usuario_id" uuid,
	"momento" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historial_envios" ADD CONSTRAINT "historial_envios_envio_fk" FOREIGN KEY ("empresa_id","envio_id") REFERENCES "public"."envios_formulario"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historial_envios_empresa_id_envio_id_momento_index" ON "historial_envios" USING btree ("empresa_id","envio_id","momento");