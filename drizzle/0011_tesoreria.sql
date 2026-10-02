CREATE TABLE "arqueos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"saldo_sistema" numeric(18, 2) NOT NULL,
	"contado" numeric(18, 2) NOT NULL,
	"diferencia" numeric(18, 2) NOT NULL,
	"movimiento_ajuste_id" uuid,
	"observaciones" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques_rechazados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cheque_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"motivo" text,
	"gastos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"nota_debito_cliente_id" uuid,
	"nota_debito_proveedor_id" uuid,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conciliaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"linea_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"origen_id" uuid NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conciliaciones_origen" CHECK ("conciliaciones"."origen" in ('recibo_valor', 'pago_valor', 'movimiento'))
);
--> statement-breakpoint
CREATE TABLE "cuentas_tesoreria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"banco" text,
	"numero_cuenta" text,
	"cbu" text,
	"medios_predeterminados" text[] DEFAULT '{}'::text[] NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_tesoreria_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "cuentas_tesoreria_tipo" CHECK ("cuentas_tesoreria"."tipo" in ('caja', 'banco', 'billetera', 'cupones', 'tarjeta', 'inversion'))
);
--> statement-breakpoint
CREATE TABLE "extractos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"archivo" text,
	"desde" date,
	"hasta" date,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extractos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "extractos_lineas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"extracto_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text NOT NULL,
	"referencia" text,
	"importe" numeric(18, 2) NOT NULL,
	"saldo" numeric(18, 2),
	"huella" text NOT NULL,
	"orden" integer NOT NULL,
	CONSTRAINT "extractos_lineas_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "movimientos_tesoreria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"tipo" text NOT NULL,
	"concepto" text,
	"detalle" text,
	"comprobante" text,
	"transferencia_id" uuid,
	"cheque_id" uuid,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"usuario_id" uuid,
	"anulado" timestamp with time zone,
	"anulado_por" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tesoreria_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "movimientos_tesoreria_tipo" CHECK ("movimientos_tesoreria"."tipo" in ('saldo_inicial', 'ingreso', 'egreso', 'transferencia', 'deposito_cheque', 'rechazo_cheque', 'acreditacion', 'comision', 'ajuste_arqueo')),
	CONSTRAINT "movimientos_tesoreria_estado" CHECK ("movimientos_tesoreria"."estado" in ('vigente', 'anulado')),
	CONSTRAINT "movimientos_tesoreria_no_cero" CHECK ("movimientos_tesoreria"."importe" <> 0)
);
--> statement-breakpoint
ALTER TABLE "pagos_valores" DROP CONSTRAINT "pagos_valores_medio";--> statement-breakpoint
ALTER TABLE "recibos_valores" ADD COLUMN "cuenta_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos_valores" ADD COLUMN "cuenta_id" uuid;--> statement-breakpoint
ALTER TABLE "arqueos" ADD CONSTRAINT "arqueos_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD CONSTRAINT "conciliaciones_linea_fk" FOREIGN KEY ("empresa_id","linea_id") REFERENCES "public"."extractos_lineas"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_tesoreria" ADD CONSTRAINT "cuentas_tesoreria_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractos" ADD CONSTRAINT "extractos_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractos_lineas" ADD CONSTRAINT "extractos_lineas_extracto_fk" FOREIGN KEY ("empresa_id","extracto_id") REFERENCES "public"."extractos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_tesoreria" ADD CONSTRAINT "movimientos_tesoreria_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arqueos_empresa_id_cuenta_id_fecha_index" ON "arqueos" USING btree ("empresa_id","cuenta_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "cheques_rechazados_empresa_id_cheque_id_index" ON "cheques_rechazados" USING btree ("empresa_id","cheque_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conciliaciones_empresa_id_origen_origen_id_index" ON "conciliaciones" USING btree ("empresa_id","origen","origen_id");--> statement-breakpoint
CREATE INDEX "conciliaciones_empresa_id_linea_id_index" ON "conciliaciones" USING btree ("empresa_id","linea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_tesoreria_empresa_id_codigo_index" ON "cuentas_tesoreria" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "extractos_lineas_empresa_id_cuenta_id_huella_index" ON "extractos_lineas" USING btree ("empresa_id","cuenta_id","huella");--> statement-breakpoint
CREATE INDEX "extractos_lineas_empresa_id_cuenta_id_fecha_index" ON "extractos_lineas" USING btree ("empresa_id","cuenta_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_tesoreria_empresa_id_cuenta_id_fecha_index" ON "movimientos_tesoreria" USING btree ("empresa_id","cuenta_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_tesoreria_empresa_id_cheque_id_index" ON "movimientos_tesoreria" USING btree ("empresa_id","cheque_id");--> statement-breakpoint
ALTER TABLE "pagos_valores" ADD CONSTRAINT "pagos_valores_medio" CHECK ("pagos_valores"."medio" in ('efectivo', 'transferencia', 'cheque_propio', 'echeq_propio', 'cheque_tercero', 'tarjeta', 'otro'));