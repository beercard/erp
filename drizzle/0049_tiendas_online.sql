CREATE TABLE "canales_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"cuenta" text NOT NULL,
	"estado" text DEFAULT 'conectado' NOT NULL,
	"credenciales" text NOT NULL,
	"secreto_avisos" text,
	"lista_precios_id" uuid,
	"deposito_id" uuid,
	"enviar_stock" boolean DEFAULT true NOT NULL,
	"enviar_precios" boolean DEFAULT false NOT NULL,
	"traer_pedidos" boolean DEFAULT true NOT NULL,
	"pedidos_hasta" timestamp with time zone,
	"ultima_sincronizacion" timestamp with time zone,
	"ultimo_error" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canales_venta_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "canales_venta_tipo" CHECK ("canales_venta"."tipo" in ('mercadolibre', 'tiendanube', 'woocommerce')),
	CONSTRAINT "canales_venta_estado" CHECK ("canales_venta"."estado" in ('conectado', 'desconectado', 'error'))
);
--> statement-breakpoint
CREATE TABLE "cuentas_canal" (
	"tipo" text NOT NULL,
	"cuenta" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	CONSTRAINT "cuentas_canal_canal_id_unique" UNIQUE("canal_id")
);
--> statement-breakpoint
CREATE TABLE "pedidos_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"externo_id" text NOT NULL,
	"numero" text,
	"estado" text NOT NULL,
	"pedido_id" uuid,
	"comprador" text,
	"total" numeric(18, 2),
	"fecha" timestamp with time zone,
	"detalle" text,
	"datos" jsonb,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_canal_estado" CHECK ("pedidos_canal"."estado" in ('importado', 'error', 'ignorado'))
);
--> statement-breakpoint
CREATE TABLE "publicaciones_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"externo_id" text NOT NULL,
	"variante_id" text DEFAULT '' NOT NULL,
	"sku" text,
	"titulo" text NOT NULL,
	"enlace" text,
	"articulo_id" uuid,
	"stock_enviado" numeric(18, 4),
	"precio_enviado" numeric(18, 2),
	"enviado_en" timestamp with time zone,
	"error" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canales_venta" ADD CONSTRAINT "canales_venta_lista_fk" FOREIGN KEY ("empresa_id","lista_precios_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canales_venta" ADD CONSTRAINT "canales_venta_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_canal" ADD CONSTRAINT "cuentas_canal_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_canal" ADD CONSTRAINT "pedidos_canal_canal_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canales_venta"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_canal" ADD CONSTRAINT "pedidos_canal_pedido_fk" FOREIGN KEY ("empresa_id","pedido_id") REFERENCES "public"."pedidos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_canal" ADD CONSTRAINT "publicaciones_canal_canal_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canales_venta"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_canal" ADD CONSTRAINT "publicaciones_canal_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canales_venta_cuenta" ON "canales_venta" USING btree ("empresa_id","tipo","cuenta");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_canal_cuenta" ON "cuentas_canal" USING btree ("tipo","cuenta");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_canal_clave" ON "pedidos_canal" USING btree ("empresa_id","canal_id","externo_id");--> statement-breakpoint
CREATE INDEX "pedidos_canal_empresa_id_canal_id_creado_index" ON "pedidos_canal" USING btree ("empresa_id","canal_id","creado");--> statement-breakpoint
CREATE UNIQUE INDEX "publicaciones_canal_clave" ON "publicaciones_canal" USING btree ("empresa_id","canal_id","externo_id","variante_id");--> statement-breakpoint
CREATE INDEX "publicaciones_canal_empresa_id_articulo_id_index" ON "publicaciones_canal" USING btree ("empresa_id","articulo_id");