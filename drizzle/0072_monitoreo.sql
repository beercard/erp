CREATE TABLE "errores_servidor" (
	"huella" text PRIMARY KEY NOT NULL,
	"mensaje" text NOT NULL,
	"ruta" text,
	"tipo" text,
	"digest" text,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"primero" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo" timestamp with time zone DEFAULT now() NOT NULL,
	"avisado" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "latidos" (
	"nombre" text PRIMARY KEY NOT NULL,
	"ultimo" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"detalle" jsonb
);
