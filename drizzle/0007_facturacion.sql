CREATE TABLE "arca_configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"ambiente" text DEFAULT 'homologacion' NOT NULL,
	"certificado" text,
	"clave_cifrada" text,
	"certificado_vence" timestamp with time zone,
	"umbral_consumidor_final" numeric(18, 2) DEFAULT '10000000' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arca_ambiente" CHECK ("arca_configuracion"."ambiente" in ('homologacion', 'produccion'))
);
--> statement-breakpoint
CREATE TABLE "arca_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"ambiente" text NOT NULL,
	"servicio" text NOT NULL,
	"token" text NOT NULL,
	"firma" text NOT NULL,
	"vence" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"clase" text NOT NULL,
	"letra" text NOT NULL,
	"tipo" smallint NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer,
	"fecha" date NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"origen" text DEFAULT 'erp' NOT NULL,
	"tercero_id" uuid NOT NULL,
	"receptor_nombre" text,
	"receptor_doc_tipo" smallint,
	"receptor_doc_numero" text,
	"receptor_condicion_iva" smallint,
	"receptor_domicilio" text,
	"concepto" smallint DEFAULT 1 NOT NULL,
	"servicio_desde" date,
	"servicio_hasta" date,
	"vencimiento" date,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"lista_precios_id" uuid,
	"vendedor_id" uuid,
	"condicion_pago_id" uuid,
	"pedido_id" uuid,
	"neto" numeric(18, 2) DEFAULT '0' NOT NULL,
	"no_gravado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"exento" numeric(18, 2) DEFAULT '0' NOT NULL,
	"iva" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tributos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cae" text,
	"cae_vence" date,
	"respuesta_arca" jsonb,
	"opcionales" jsonb,
	"observaciones" text,
	"usuario_id" uuid,
	"autorizado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprobantes_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "comprobantes_clase" CHECK ("comprobantes"."clase" in ('factura', 'nota_debito', 'nota_credito')),
	CONSTRAINT "comprobantes_estado" CHECK ("comprobantes"."estado" in ('borrador', 'autorizado', 'pendiente_verificacion')),
	CONSTRAINT "comprobantes_autorizado_completo" CHECK ("comprobantes"."estado" <> 'autorizado' or ("comprobantes"."numero" is not null and ("comprobantes"."cae" is not null or "comprobantes"."origen" <> 'erp')))
);
--> statement-breakpoint
CREATE TABLE "comprobantes_asociados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"asociado_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"precio_unitario" numeric(18, 4) NOT NULL,
	"descuento" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"neto" numeric(18, 2) NOT NULL,
	"iva" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes_iva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"alicuota_iva" smallint NOT NULL,
	"base" numeric(18, 2) NOT NULL,
	"importe" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobantes_tributos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"tributo" smallint NOT NULL,
	"descripcion" text NOT NULL,
	"base" numeric(18, 2) NOT NULL,
	"alicuota" numeric(7, 4) NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"percepcion_id" uuid
);
--> statement-breakpoint
CREATE TABLE "imputaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"recibo_id" uuid,
	"nota_credito_id" uuid,
	"comprobante_id" uuid NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"fecha" date NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imputaciones_un_origen" CHECK (("imputaciones"."recibo_id" is null) <> ("imputaciones"."nota_credito_id" is null)),
	CONSTRAINT "imputaciones_positiva" CHECK ("imputaciones"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "percepciones_iibb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"provincia" text,
	"alicuota" numeric(18, 4) NOT NULL,
	"minimo_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"solo_letra_a" boolean DEFAULT true NOT NULL,
	"tributo_arca" smallint DEFAULT 7 NOT NULL,
	"activa" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recibos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"estado" text DEFAULT 'emitido' NOT NULL,
	"observaciones" text,
	"usuario_id" uuid,
	"anulado" timestamp with time zone,
	"anulado_por" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recibos_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "recibos_estado" CHECK ("recibos"."estado" in ('emitido', 'anulado'))
);
--> statement-breakpoint
CREATE TABLE "recibos_valores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"recibo_id" uuid NOT NULL,
	"medio" text NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"detalle" text,
	"banco" text,
	"numero_valor" text,
	"fecha_pago" date,
	"cuit_librador" text,
	CONSTRAINT "recibos_valores_medio" CHECK ("recibos_valores"."medio" in ('efectivo', 'transferencia', 'cheque', 'echeq', 'tarjeta_credito', 'tarjeta_debito', 'mercado_pago', 'retencion_iibb', 'retencion_ganancias', 'retencion_iva', 'retencion_suss', 'otro'))
);
--> statement-breakpoint
ALTER TABLE "terceros" ADD COLUMN "percepcion_iibb" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_receptor_doc_tipo_tipos_documento_codigo_fk" FOREIGN KEY ("receptor_doc_tipo") REFERENCES "public"."tipos_documento"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_receptor_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("receptor_condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_lista_fk" FOREIGN KEY ("empresa_id","lista_precios_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_vendedor_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_condicion_fk" FOREIGN KEY ("empresa_id","condicion_pago_id") REFERENCES "public"."condiciones_pago"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_pedido_fk" FOREIGN KEY ("empresa_id","pedido_id") REFERENCES "public"."pedidos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_asociados" ADD CONSTRAINT "comprobantes_asociados_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_asociados" ADD CONSTRAINT "comprobantes_asociados_asociado_fk" FOREIGN KEY ("empresa_id","asociado_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_items" ADD CONSTRAINT "comprobantes_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_items" ADD CONSTRAINT "comprobantes_items_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_items" ADD CONSTRAINT "comprobantes_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_iva" ADD CONSTRAINT "comprobantes_iva_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_iva" ADD CONSTRAINT "comprobantes_iva_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_tributos" ADD CONSTRAINT "comprobantes_tributos_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones" ADD CONSTRAINT "imputaciones_recibo_fk" FOREIGN KEY ("empresa_id","recibo_id") REFERENCES "public"."recibos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones" ADD CONSTRAINT "imputaciones_nota_credito_fk" FOREIGN KEY ("empresa_id","nota_credito_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones" ADD CONSTRAINT "imputaciones_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "percepciones_iibb" ADD CONSTRAINT "percepciones_iibb_provincia_provincias_codigo_fk" FOREIGN KEY ("provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos_valores" ADD CONSTRAINT "recibos_valores_recibo_fk" FOREIGN KEY ("empresa_id","recibo_id") REFERENCES "public"."recibos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arca_configuracion_empresa_id_index" ON "arca_configuracion" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "arca_tickets_empresa_id_ambiente_servicio_index" ON "arca_tickets" USING btree ("empresa_id","ambiente","servicio");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_numero" ON "comprobantes" USING btree ("empresa_id","tipo","punto_venta","numero");--> statement-breakpoint
CREATE INDEX "comprobantes_empresa_id_tercero_id_index" ON "comprobantes" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "comprobantes_empresa_id_fecha_index" ON "comprobantes" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_asociados_empresa_id_comprobante_id_asociado_id_index" ON "comprobantes_asociados" USING btree ("empresa_id","comprobante_id","asociado_id");--> statement-breakpoint
CREATE INDEX "comprobantes_items_empresa_id_comprobante_id_index" ON "comprobantes_items" USING btree ("empresa_id","comprobante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_iva_empresa_id_comprobante_id_alicuota_iva_index" ON "comprobantes_iva" USING btree ("empresa_id","comprobante_id","alicuota_iva");--> statement-breakpoint
CREATE INDEX "comprobantes_tributos_empresa_id_comprobante_id_index" ON "comprobantes_tributos" USING btree ("empresa_id","comprobante_id");--> statement-breakpoint
CREATE INDEX "imputaciones_empresa_id_comprobante_id_index" ON "imputaciones" USING btree ("empresa_id","comprobante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "percepciones_iibb_empresa_id_nombre_index" ON "percepciones_iibb" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "recibos_empresa_id_punto_venta_numero_index" ON "recibos" USING btree ("empresa_id","punto_venta","numero");--> statement-breakpoint
CREATE INDEX "recibos_empresa_id_tercero_id_index" ON "recibos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "recibos_valores_empresa_id_recibo_id_index" ON "recibos_valores" USING btree ("empresa_id","recibo_id");