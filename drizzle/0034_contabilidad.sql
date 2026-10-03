CREATE TABLE "asientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"concepto" text NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"origen_id" uuid,
	"automatico" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'registrado' NOT NULL,
	"revierte_id" uuid,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asientos_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "asientos_estado" CHECK ("asientos"."estado" in ('registrado', 'anulado')),
	CONSTRAINT "asientos_origen_valido" CHECK ("asientos"."origen" in ('manual', 'venta', 'compra', 'cobranza', 'pago', 'cheque_propio', 'tesoreria', 'cheque_rechazado', 'liquidacion_iva', 'refundicion', 'apertura'))
);
--> statement-breakpoint
CREATE TABLE "asientos_lineas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"asiento_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"debe" numeric(18, 2) DEFAULT '0' NOT NULL,
	"haber" numeric(18, 2) DEFAULT '0' NOT NULL,
	"detalle" text,
	"tercero_id" uuid,
	CONSTRAINT "asientos_lineas_un_lado" CHECK (("asientos_lineas"."debe" = 0) <> ("asientos_lineas"."haber" = 0) and "asientos_lineas"."debe" >= 0 and "asientos_lineas"."haber" >= 0)
);
--> statement-breakpoint
CREATE TABLE "configuracion_contable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"inicio" date NOT NULL,
	"cerrado_hasta" date,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas_contables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"imputable" boolean DEFAULT true NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_contables_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "cuentas_contables_tipo" CHECK ("cuentas_contables"."tipo" in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
	CONSTRAINT "cuentas_contables_codigo_valido" CHECK ("cuentas_contables"."codigo" ~ '^[0-9]+(\.[0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "ejercicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"inicio" date NOT NULL,
	"fin" date NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"cerrado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ejercicios_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "ejercicios_fechas" CHECK ("ejercicios"."fin" > "ejercicios"."inicio"),
	CONSTRAINT "ejercicios_estado" CHECK ("ejercicios"."estado" in ('abierto', 'cerrado'))
);
--> statement-breakpoint
CREATE TABLE "imputaciones_contables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"clave" text NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asientos_lineas" ADD CONSTRAINT "asientos_lineas_asiento_fk" FOREIGN KEY ("empresa_id","asiento_id") REFERENCES "public"."asientos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asientos_lineas" ADD CONSTRAINT "asientos_lineas_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_contables"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputaciones_contables" ADD CONSTRAINT "imputaciones_contables_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_contables"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asientos_numero" ON "asientos" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "asientos_origen" ON "asientos" USING btree ("empresa_id","origen","origen_id",("revierte_id" is not null)) WHERE "asientos"."origen_id" is not null and "asientos"."estado" = 'registrado';--> statement-breakpoint
CREATE INDEX "asientos_empresa_id_fecha_index" ON "asientos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "asientos_lineas_empresa_id_asiento_id_index" ON "asientos_lineas" USING btree ("empresa_id","asiento_id");--> statement-breakpoint
CREATE INDEX "asientos_lineas_empresa_id_cuenta_id_index" ON "asientos_lineas" USING btree ("empresa_id","cuenta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "configuracion_contable_empresa" ON "configuracion_contable" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_contables_codigo" ON "cuentas_contables" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "ejercicios_inicio" ON "ejercicios" USING btree ("empresa_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "imputaciones_contables_clave" ON "imputaciones_contables" USING btree ("empresa_id","clave");