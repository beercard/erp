CREATE TABLE "facturas_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cada_meses" smallint DEFAULT 1 NOT NULL,
	"proxima" date NOT NULL,
	"hasta" date,
	"punto_venta" integer NOT NULL,
	"concepto" smallint DEFAULT 2 NOT NULL,
	"dias_vencimiento" smallint DEFAULT 10 NOT NULL,
	"renglones" jsonb NOT NULL,
	"observaciones" text,
	"autorizar" boolean DEFAULT true NOT NULL,
	"enviar" boolean DEFAULT true NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"ultima_factura_id" uuid,
	"ultimo_error" text,
	"emitidas" integer DEFAULT 0 NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facturas_recurrentes_cada" CHECK ("facturas_recurrentes"."cada_meses" in (1, 2, 3, 6, 12)),
	CONSTRAINT "facturas_recurrentes_concepto" CHECK ("facturas_recurrentes"."concepto" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "facturas_suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"detalle" text NOT NULL,
	"desde" date,
	"hasta" date,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"comprobante_id" uuid,
	"numero" text,
	"error" text,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facturas_suscripcion_estado" CHECK ("facturas_suscripcion"."estado" in ('pendiente', 'emitida', 'error'))
);
--> statement-breakpoint
CREATE TABLE "lotes_facturacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"comprobantes" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"autorizar" boolean DEFAULT true NOT NULL,
	"enviar" boolean DEFAULT true NOT NULL,
	"estado" text DEFAULT 'preparado' NOT NULL,
	"errores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lotes_facturacion_estado" CHECK ("lotes_facturacion"."estado" in ('preparado', 'autorizando', 'terminado'))
);
--> statement-breakpoint
ALTER TABLE "comprobantes" ADD COLUMN "referencia_externa" text;--> statement-breakpoint
ALTER TABLE "facturas_recurrentes" ADD CONSTRAINT "facturas_recurrentes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_recurrentes" ADD CONSTRAINT "facturas_recurrentes_ultima_factura_id_comprobantes_id_fk" FOREIGN KEY ("ultima_factura_id") REFERENCES "public"."comprobantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_suscripcion" ADD CONSTRAINT "facturas_suscripcion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_suscripcion" ADD CONSTRAINT "facturas_suscripcion_evento_id_eventos_suscripcion_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos_suscripcion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_facturacion" ADD CONSTRAINT "lotes_facturacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facturas_recurrentes_empresa_id_activa_proxima_index" ON "facturas_recurrentes" USING btree ("empresa_id","activa","proxima");--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_suscripcion_evento_id_index" ON "facturas_suscripcion" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "facturas_suscripcion_estado_index" ON "facturas_suscripcion" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "lotes_facturacion_empresa_id_estado_index" ON "lotes_facturacion" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_referencia_externa" ON "comprobantes" USING btree ("empresa_id","referencia_externa") WHERE "comprobantes"."referencia_externa" is not null;