CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"clase" text NOT NULL,
	"letra" text NOT NULL,
	"tipo" smallint NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"periodo_iva" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"cae" text,
	"vencimiento" date,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"deposito_id" uuid,
	"orden_compra_id" uuid,
	"neto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"no_gravado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"exento" numeric(18, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tributos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estado" text DEFAULT 'registrado' NOT NULL,
	"origen" text DEFAULT 'erp' NOT NULL,
	"observaciones" text,
	"usuario_id" uuid,
	"anulado" timestamp with time zone,
	"anulado_por" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "compras_clase" CHECK ("compras"."clase" in ('factura', 'nota_debito', 'nota_credito')),
	CONSTRAINT "compras_estado" CHECK ("compras"."estado" in ('registrado', 'anulado')),
	CONSTRAINT "compras_origen" CHECK ("compras"."origen" in ('erp', 'mis_comprobantes', 'pymexis')),
	CONSTRAINT "compras_periodo" CHECK ("compras"."periodo_iva" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "compras_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"compra_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"descuento" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"neto" numeric(18, 2) NOT NULL,
	"iva" numeric(18, 2) NOT NULL,
	"orden_item_id" uuid
);
--> statement-breakpoint
CREATE TABLE "compras_iva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"compra_id" uuid NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"base" numeric(18, 2) NOT NULL,
	"importe" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_tributos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"compra_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"provincia" text,
	"base" numeric(18, 2),
	"alicuota" numeric(7, 4),
	"importe" numeric(18, 2) NOT NULL,
	CONSTRAINT "compras_tributos_tipo" CHECK ("compras_tributos"."tipo" in ('percepcion_iva', 'percepcion_iibb', 'percepcion_ganancias', 'impuestos_internos', 'impuesto_municipal', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "escala_ganancias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"desde" numeric(18, 2) NOT NULL,
	"hasta" numeric(18, 2),
	"fijo" numeric(18, 2) NOT NULL,
	"porcentaje" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imputaciones_compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"pago_id" uuid,
	"nota_credito_id" uuid,
	"compra_id" uuid NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"importe_origen" numeric(18, 2) NOT NULL,
	"fecha" date NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imputaciones_compras_un_origen" CHECK (("imputaciones_compras"."pago_id" is null) <> ("imputaciones_compras"."nota_credito_id" is null)),
	CONSTRAINT "imputaciones_compras_positiva" CHECK ("imputaciones_compras"."importe" > 0 and "imputaciones_compras"."importe_origen" > 0)
);
--> statement-breakpoint
CREATE TABLE "ordenes_compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"deposito_id" uuid,
	"fecha_entrega" date,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"neto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"observaciones" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordenes_compra_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "ordenes_compra_estado" CHECK ("ordenes_compra"."estado" in ('pendiente', 'parcial', 'recibida', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "ordenes_compra_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"descuento" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"neto" numeric(18, 2) NOT NULL,
	"iva" numeric(18, 2) NOT NULL,
	CONSTRAINT "ordenes_compra_items_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"base_ganancias" numeric(18, 2) DEFAULT '0' NOT NULL,
	"regimen_ganancias" text,
	"estado" text DEFAULT 'emitido' NOT NULL,
	"observaciones" text,
	"usuario_id" uuid,
	"anulado" timestamp with time zone,
	"anulado_por" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "pagos_estado" CHECK ("pagos"."estado" in ('emitido', 'anulado'))
);
--> statement-breakpoint
CREATE TABLE "pagos_valores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"pago_id" uuid NOT NULL,
	"medio" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"detalle" text,
	"banco" text,
	"numero_valor" text,
	"fecha_pago" date,
	"recibo_valor_id" uuid,
	CONSTRAINT "pagos_valores_medio" CHECK ("pagos_valores"."medio" in ('efectivo', 'transferencia', 'cheque_propio', 'echeq_propio', 'cheque_tercero', 'otro')),
	CONSTRAINT "pagos_valores_positivo" CHECK ("pagos_valores"."importe" > 0),
	CONSTRAINT "pagos_valores_cheque_tercero" CHECK (("pagos_valores"."medio" = 'cheque_tercero') = ("pagos_valores"."recibo_valor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "regimenes_ganancias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"concepto" text NOT NULL,
	"alicuota_inscripto" numeric(18, 4) NOT NULL,
	"alicuota_no_inscripto" numeric(18, 4) NOT NULL,
	"minimo_no_sujeto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimo_retencion" numeric(18, 2) DEFAULT '0' NOT NULL,
	"usa_escala" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retenciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"pago_id" uuid NOT NULL,
	"impuesto" text NOT NULL,
	"regimen" text,
	"numero" integer NOT NULL,
	"base" numeric(18, 2) NOT NULL,
	"alicuota" numeric(18, 4),
	"importe" numeric(18, 2) NOT NULL,
	CONSTRAINT "retenciones_impuesto" CHECK ("retenciones"."impuesto" in ('ganancias', 'iibb', 'iva', 'suss')),
	CONSTRAINT "retenciones_positiva" CHECK ("retenciones"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "retenciones_configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"ganancias_activa" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terceros" ADD COLUMN "regimen_ganancias" text;--> statement-breakpoint
ALTER TABLE "terceros" ADD COLUMN "ganancias_inscripto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_orden_fk" FOREIGN KEY ("empresa_id","orden_compra_id") REFERENCES "public"."ordenes_compra"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compras"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_orden_item_fk" FOREIGN KEY ("empresa_id","orden_item_id") REFERENCES "public"."ordenes_compra_items"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_iva" ADD CONSTRAINT "compras_iva_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_iva" ADD CONSTRAINT "compras_iva_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compras"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_tributos" ADD CONSTRAINT "compras_tributos_provincia_provincias_codigo_fk" FOREIGN KEY ("provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_tributos" ADD CONSTRAINT "compras_tributos_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compras"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones_compras" ADD CONSTRAINT "imputaciones_compras_pago_fk" FOREIGN KEY ("empresa_id","pago_id") REFERENCES "public"."pagos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones_compras" ADD CONSTRAINT "imputaciones_compras_nota_credito_fk" FOREIGN KEY ("empresa_id","nota_credito_id") REFERENCES "public"."compras"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones_compras" ADD CONSTRAINT "imputaciones_compras_compra_fk" FOREIGN KEY ("empresa_id","compra_id") REFERENCES "public"."compras"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra_items" ADD CONSTRAINT "ordenes_compra_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra_items" ADD CONSTRAINT "ordenes_compra_items_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_compra"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra_items" ADD CONSTRAINT "ordenes_compra_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_valores" ADD CONSTRAINT "pagos_valores_pago_fk" FOREIGN KEY ("empresa_id","pago_id") REFERENCES "public"."pagos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_valores" ADD CONSTRAINT "pagos_valores_recibo_valor_fk" FOREIGN KEY ("recibo_valor_id") REFERENCES "public"."recibos_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retenciones" ADD CONSTRAINT "retenciones_pago_fk" FOREIGN KEY ("empresa_id","pago_id") REFERENCES "public"."pagos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compras_numero" ON "compras" USING btree ("empresa_id","tercero_id","tipo","punto_venta","numero") WHERE "compras"."estado" = 'registrado';--> statement-breakpoint
CREATE INDEX "compras_empresa_id_tercero_id_index" ON "compras" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "compras_empresa_id_periodo_iva_index" ON "compras" USING btree ("empresa_id","periodo_iva");--> statement-breakpoint
CREATE INDEX "compras_items_empresa_id_compra_id_index" ON "compras_items" USING btree ("empresa_id","compra_id");--> statement-breakpoint
CREATE INDEX "compras_items_empresa_id_orden_item_id_index" ON "compras_items" USING btree ("empresa_id","orden_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_iva_empresa_id_compra_id_alicuota_iva_index" ON "compras_iva" USING btree ("empresa_id","compra_id","alicuota_iva");--> statement-breakpoint
CREATE INDEX "compras_tributos_empresa_id_compra_id_index" ON "compras_tributos" USING btree ("empresa_id","compra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escala_ganancias_empresa_id_desde_index" ON "escala_ganancias" USING btree ("empresa_id","desde");--> statement-breakpoint
CREATE INDEX "imputaciones_compras_empresa_id_compra_id_index" ON "imputaciones_compras" USING btree ("empresa_id","compra_id");--> statement-breakpoint
CREATE INDEX "imputaciones_compras_empresa_id_pago_id_index" ON "imputaciones_compras" USING btree ("empresa_id","pago_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_compra_empresa_id_numero_index" ON "ordenes_compra" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "ordenes_compra_empresa_id_tercero_id_index" ON "ordenes_compra" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "ordenes_compra_items_empresa_id_orden_id_index" ON "ordenes_compra_items" USING btree ("empresa_id","orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_empresa_id_numero_index" ON "pagos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "pagos_empresa_id_tercero_id_fecha_index" ON "pagos" USING btree ("empresa_id","tercero_id","fecha");--> statement-breakpoint
CREATE INDEX "pagos_valores_empresa_id_pago_id_index" ON "pagos_valores" USING btree ("empresa_id","pago_id");--> statement-breakpoint
CREATE INDEX "pagos_valores_empresa_id_recibo_valor_id_index" ON "pagos_valores" USING btree ("empresa_id","recibo_valor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regimenes_ganancias_empresa_id_codigo_index" ON "regimenes_ganancias" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "retenciones_empresa_id_impuesto_numero_index" ON "retenciones" USING btree ("empresa_id","impuesto","numero");--> statement-breakpoint
CREATE INDEX "retenciones_empresa_id_pago_id_index" ON "retenciones" USING btree ("empresa_id","pago_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retenciones_configuracion_empresa_id_index" ON "retenciones_configuracion" USING btree ("empresa_id");