CREATE TABLE "claves_cobro" (
	"clave" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_online" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"comprobante_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"pasarela_id" uuid,
	"proveedor" text,
	"externo_id" text,
	"pago_externo_id" text,
	"url_pasarela" text,
	"clave" text NOT NULL,
	"clave_aviso" text NOT NULL,
	"vence" timestamp with time zone,
	"aprobado" timestamp with time zone,
	"recibo_id" uuid,
	"origen" text DEFAULT 'erp' NOT NULL,
	"detalle" jsonb,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_online_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pagos_online_estado" CHECK ("pagos_online"."estado" in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'vencido')),
	CONSTRAINT "pagos_online_importe" CHECK ("pagos_online"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "pasarelas_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"proveedor" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"prueba" boolean DEFAULT false NOT NULL,
	"credenciales" text NOT NULL,
	"secreto_avisos" text,
	"cuenta_id" uuid,
	"medio" text DEFAULT 'otro' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pasarelas_pago_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pasarelas_pago_proveedor_valido" CHECK ("pasarelas_pago"."proveedor" in ('mercadopago', 'payway', 'gocuotas', 'clover'))
);
--> statement-breakpoint
ALTER TABLE "claves_cobro" ADD CONSTRAINT "claves_cobro_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_online" ADD CONSTRAINT "pagos_online_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_online" ADD CONSTRAINT "pagos_online_pasarela_fk" FOREIGN KEY ("empresa_id","pasarela_id") REFERENCES "public"."pasarelas_pago"("empresa_id","id") ON DELETE SET NULL ("pasarela_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_online" ADD CONSTRAINT "pagos_online_recibo_fk" FOREIGN KEY ("empresa_id","recibo_id") REFERENCES "public"."recibos"("empresa_id","id") ON DELETE SET NULL ("recibo_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasarelas_pago" ADD CONSTRAINT "pasarelas_pago_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE SET NULL ("cuenta_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_online_empresa_id_estado_creado_index" ON "pagos_online" USING btree ("empresa_id","estado","creado");--> statement-breakpoint
CREATE INDEX "pagos_online_empresa_id_tercero_id_index" ON "pagos_online" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pasarelas_pago_proveedor" ON "pasarelas_pago" USING btree ("empresa_id","proveedor");