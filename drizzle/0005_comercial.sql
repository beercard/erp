CREATE TABLE "cotizaciones_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"moneda" text NOT NULL,
	"fecha" date NOT NULL,
	"valor" numeric(18, 6) NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"articulo_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"tipo" text NOT NULL,
	"origen_id" uuid,
	"observacion" text,
	"usuario_id" uuid
);
--> statement-breakpoint
CREATE TABLE "numeradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tipo" text NOT NULL,
	"punto_venta" integer DEFAULT 0 NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"vendedor_id" uuid,
	"lista_precios_id" uuid,
	"condicion_pago_id" uuid,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"observaciones" text,
	"neto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"presupuesto_id" uuid,
	"deposito_id" uuid,
	"fecha_entrega" date,
	"origen" text DEFAULT 'manual' NOT NULL,
	"id_externo" text,
	CONSTRAINT "pedidos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "pedidos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"descuento" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"neto" numeric(18, 2) NOT NULL,
	"iva" numeric(18, 2) NOT NULL,
	"pedido_id" uuid NOT NULL,
	"cantidad_entregada" numeric(18, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "pedidos_items_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"vendedor_id" uuid,
	"lista_precios_id" uuid,
	"condicion_pago_id" uuid,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"observaciones" text,
	"neto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"validez_dias" smallint DEFAULT 15 NOT NULL,
	CONSTRAINT "presupuestos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "presupuestos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"descuento" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"neto" numeric(18, 2) NOT NULL,
	"iva" numeric(18, 2) NOT NULL,
	"presupuesto_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"pedido_id" uuid,
	"deposito_id" uuid NOT NULL,
	"transporte_id" uuid,
	"estado" text DEFAULT 'emitido' NOT NULL,
	"observaciones" text,
	"usuario_id" uuid,
	"anulado_por" uuid,
	"anulado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remitos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "remitos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"remito_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"pedido_item_id" uuid,
	"series" text[]
);
--> statement-breakpoint
ALTER TABLE "cotizaciones_empresa" ADD CONSTRAINT "cotizaciones_empresa_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_lista_fk" FOREIGN KEY ("empresa_id","lista_precios_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_condicion_fk" FOREIGN KEY ("empresa_id","condicion_pago_id") REFERENCES "public"."condiciones_pago"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_presupuesto_fk" FOREIGN KEY ("empresa_id","presupuesto_id") REFERENCES "public"."presupuestos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_items" ADD CONSTRAINT "pedidos_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_items" ADD CONSTRAINT "pedidos_items_pedido_fk" FOREIGN KEY ("empresa_id","pedido_id") REFERENCES "public"."pedidos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_items" ADD CONSTRAINT "pedidos_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_vendedor_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_lista_fk" FOREIGN KEY ("empresa_id","lista_precios_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_condicion_fk" FOREIGN KEY ("empresa_id","condicion_pago_id") REFERENCES "public"."condiciones_pago"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_items" ADD CONSTRAINT "presupuestos_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_items" ADD CONSTRAINT "presupuestos_items_presupuesto_fk" FOREIGN KEY ("empresa_id","presupuesto_id") REFERENCES "public"."presupuestos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos_items" ADD CONSTRAINT "presupuestos_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_pedido_fk" FOREIGN KEY ("empresa_id","pedido_id") REFERENCES "public"."pedidos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos" ADD CONSTRAINT "remitos_transporte_fk" FOREIGN KEY ("empresa_id","transporte_id") REFERENCES "public"."transportes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos_items" ADD CONSTRAINT "remitos_items_remito_fk" FOREIGN KEY ("empresa_id","remito_id") REFERENCES "public"."remitos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos_items" ADD CONSTRAINT "remitos_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remitos_items" ADD CONSTRAINT "remitos_items_pedido_item_fk" FOREIGN KEY ("empresa_id","pedido_item_id") REFERENCES "public"."pedidos_items"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cotizaciones_empresa_empresa_id_moneda_fecha_index" ON "cotizaciones_empresa" USING btree ("empresa_id","moneda","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_stock_empresa_id_articulo_id_deposito_id_index" ON "movimientos_stock" USING btree ("empresa_id","articulo_id","deposito_id");--> statement-breakpoint
CREATE INDEX "movimientos_stock_empresa_id_fecha_index" ON "movimientos_stock" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "numeradores_empresa_id_tipo_punto_venta_index" ON "numeradores" USING btree ("empresa_id","tipo","punto_venta");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_empresa_id_numero_index" ON "pedidos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "pedidos_empresa_id_tercero_id_index" ON "pedidos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "pedidos_empresa_id_estado_index" ON "pedidos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_externo" ON "pedidos" USING btree ("empresa_id","origen","id_externo");--> statement-breakpoint
CREATE INDEX "pedidos_items_empresa_id_pedido_id_index" ON "pedidos_items" USING btree ("empresa_id","pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_empresa_id_numero_index" ON "presupuestos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "presupuestos_empresa_id_tercero_id_index" ON "presupuestos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "presupuestos_items_empresa_id_presupuesto_id_index" ON "presupuestos_items" USING btree ("empresa_id","presupuesto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remitos_empresa_id_punto_venta_numero_index" ON "remitos" USING btree ("empresa_id","punto_venta","numero");--> statement-breakpoint
CREATE INDEX "remitos_empresa_id_tercero_id_index" ON "remitos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "remitos_items_empresa_id_remito_id_index" ON "remitos_items" USING btree ("empresa_id","remito_id");