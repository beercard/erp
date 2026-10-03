ALTER TABLE "suscripciones" ADD COLUMN "mp_suscripcion" text;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "mp_estado" text;--> statement-breakpoint
CREATE UNIQUE INDEX "suscripciones_mp_suscripcion" ON "suscripciones" ("mp_suscripcion") WHERE "mp_suscripcion" IS NOT NULL;
