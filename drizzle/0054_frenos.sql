CREATE TABLE "frenos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frenos_clave_creado_index" ON "frenos" USING btree ("clave","creado");--> statement-breakpoint
CREATE INDEX "frenos_creado_index" ON "frenos" USING btree ("creado");