CREATE TABLE "contratos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"modalidad" text DEFAULT 'abono' NOT NULL,
	"facturacion" text DEFAULT 'vencida' NOT NULL,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"cargo_fijo" numeric(18, 2) DEFAULT '0' NOT NULL,
	"copias_libres" integer DEFAULT 0 NOT NULL,
	"precio_excedente" numeric(18, 6) DEFAULT '0' NOT NULL,
	"por_equipo" boolean DEFAULT false NOT NULL,
	"alicuota_iva" smallint DEFAULT 5 NOT NULL,
	"leyenda" text,
	"desde" date,
	"hasta" date,
	"estado" text DEFAULT 'activo' NOT NULL,
	"codigo_origen" text,
	"observaciones" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contratos_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "contratos_modalidad" CHECK ("contratos"."modalidad" in ('abono', 'excedente', 'cargo_fijo')),
	CONSTRAINT "contratos_facturacion" CHECK ("contratos"."facturacion" in ('adelantada', 'vencida')),
	CONSTRAINT "contratos_estado" CHECK ("contratos"."estado" in ('activo', 'suspendido', 'finalizado'))
);
--> statement-breakpoint
CREATE TABLE "equipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"serie" text NOT NULL,
	"modelo_id" uuid,
	"articulo_id" uuid,
	"tercero_id" uuid,
	"contrato_id" uuid,
	"comercializacion" text DEFAULT 'venta' NOT NULL,
	"estado" text DEFAULT 'instalado' NOT NULL,
	"fecha_instalacion" date,
	"garantia_hasta" date,
	"fecha_retiro" date,
	"motivo_retiro" text,
	"domicilio" text,
	"localidad" text,
	"sector" text,
	"contacto" text,
	"telefono" text,
	"horario" text,
	"ip" text,
	"tecnico" text,
	"contador_inicial" bigint DEFAULT 0 NOT NULL,
	"observaciones" text,
	"codigo_origen" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipos_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "equipos_estado" CHECK ("equipos"."estado" in ('instalado', 'retirado')),
	CONSTRAINT "equipos_comercializacion" CHECK ("equipos"."comercializacion" in ('contrato', 'venta', 'servicio_tecnico', 'comodato', 'leasing', 'donacion'))
);
--> statement-breakpoint
CREATE TABLE "facturaciones_contrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"contrato_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"fecha" date NOT NULL,
	"equipos" integer NOT NULL,
	"copias" integer NOT NULL,
	"copias_libres" integer NOT NULL,
	"copias_excedentes" integer NOT NULL,
	"cargo" numeric(18, 2) NOT NULL,
	"excedente" numeric(18, 2) NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"moneda" text NOT NULL,
	"cotizacion" numeric(18, 6) DEFAULT '1' NOT NULL,
	"detalle" jsonb NOT NULL,
	"comprobante_id" uuid,
	"estado" text DEFAULT 'facturada' NOT NULL,
	"origen" text DEFAULT 'erp' NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facturaciones_contrato_estado" CHECK ("facturaciones_contrato"."estado" in ('facturada', 'anulada')),
	CONSTRAINT "facturaciones_contrato_periodo_valido" CHECK ("facturaciones_contrato"."periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "lecturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"equipo_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"contador" bigint NOT NULL,
	"creditos" integer DEFAULT 0 NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecturas_origen" CHECK ("lecturas"."origen" in ('manual', 'archivo', 'mps', 'pymexis')),
	CONSTRAINT "lecturas_positivo" CHECK ("lecturas"."contador" >= 0 and "lecturas"."creditos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "modelos_equipo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"color" boolean DEFAULT false NOT NULL,
	"multifuncion" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modelos_equipo_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_modelo_fk" FOREIGN KEY ("empresa_id","modelo_id") REFERENCES "public"."modelos_equipo"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_contrato_fk" FOREIGN KEY ("empresa_id","contrato_id") REFERENCES "public"."contratos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturaciones_contrato" ADD CONSTRAINT "facturaciones_contrato_contrato_fk" FOREIGN KEY ("empresa_id","contrato_id") REFERENCES "public"."contratos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturaciones_contrato" ADD CONSTRAINT "facturaciones_contrato_comprobante_fk" FOREIGN KEY ("empresa_id","comprobante_id") REFERENCES "public"."comprobantes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturas" ADD CONSTRAINT "lecturas_equipo_fk" FOREIGN KEY ("empresa_id","equipo_id") REFERENCES "public"."equipos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contratos_empresa_id_numero_index" ON "contratos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "contratos_codigo_origen" ON "contratos" USING btree ("empresa_id","codigo_origen");--> statement-breakpoint
CREATE INDEX "contratos_empresa_id_tercero_id_index" ON "contratos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "equipos_empresa_id_serie_index" ON "equipos" USING btree ("empresa_id","serie");--> statement-breakpoint
CREATE INDEX "equipos_empresa_id_tercero_id_index" ON "equipos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "equipos_empresa_id_contrato_id_index" ON "equipos" USING btree ("empresa_id","contrato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipos_codigo_origen" ON "equipos" USING btree ("empresa_id","codigo_origen");--> statement-breakpoint
CREATE UNIQUE INDEX "facturaciones_contrato_periodo" ON "facturaciones_contrato" USING btree ("empresa_id","contrato_id","periodo") WHERE "facturaciones_contrato"."estado" = 'facturada';--> statement-breakpoint
CREATE INDEX "facturaciones_contrato_empresa_id_periodo_index" ON "facturaciones_contrato" USING btree ("empresa_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "lecturas_empresa_id_equipo_id_fecha_index" ON "lecturas" USING btree ("empresa_id","equipo_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "modelos_equipo_empresa_id_codigo_index" ON "modelos_equipo" USING btree ("empresa_id","codigo");