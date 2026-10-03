CREATE TABLE "consultas_sitio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"telefono" text,
	"empresa" text,
	"rubro" text,
	"mensaje" text NOT NULL,
	"origen" text,
	"ip_hash" text,
	"estado" text DEFAULT 'nueva' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "consultas_sitio_creado_index" ON "consultas_sitio" USING btree ("creado");--> statement-breakpoint
CREATE INDEX "consultas_sitio_ip_hash_creado_index" ON "consultas_sitio" USING btree ("ip_hash","creado");