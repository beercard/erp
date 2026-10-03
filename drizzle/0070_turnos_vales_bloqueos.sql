CREATE TABLE "turnos_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"abierto" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"fondo_esperado" numeric(18, 2) NOT NULL,
	"fondo_contado" numeric(18, 2) NOT NULL,
	"conteo_apertura" jsonb,
	"arqueo_apertura_id" uuid,
	"nota" text,
	"cierre_id" uuid,
	"cerrado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnos_caja_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "turnos_caja_estado" CHECK ("turnos_caja"."estado" in ('abierto', 'cerrado'))
);
--> statement-breakpoint
CREATE TABLE "vales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"persona" text NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(18, 2) NOT NULL,
	"motivo" text,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"movimiento_id" uuid,
	"gastos" jsonb,
	"gastado" numeric(18, 2),
	"devuelto" numeric(18, 2),
	"movimiento_rendicion_id" uuid,
	"fecha_rendicion" date,
	"usuario_id" uuid,
	"rendido_por" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vales_estado" CHECK ("vales"."estado" in ('abierto', 'rendido', 'anulado')),
	CONSTRAINT "vales_positivo" CHECK ("vales"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "bloqueos_modulo" (
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"modulo" text NOT NULL,
	"cerrado_hasta" date NOT NULL,
	"usuario_id" uuid,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueos_modulo_empresa_id_modulo_pk" PRIMARY KEY("empresa_id","modulo"),
	CONSTRAINT "bloqueos_modulo_modulo" CHECK ("bloqueos_modulo"."modulo" in ('ventas', 'compras', 'tesoreria', 'stock'))
);
--> statement-breakpoint
ALTER TABLE "movimientos_tesoreria" DROP CONSTRAINT "movimientos_tesoreria_tipo";--> statement-breakpoint
ALTER TABLE "recibos" ADD COLUMN "turno_id" uuid;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "turno_id" uuid;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "medios" jsonb;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "aprobado_por" uuid;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "envio" jsonb;--> statement-breakpoint
ALTER TABLE "cuentas_tesoreria" ADD COLUMN "exige_turno" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cuentas_tesoreria" ADD COLUMN "diferencia_maxima" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "cuentas_tesoreria" ADD COLUMN "aviso_cierre" jsonb;--> statement-breakpoint
ALTER TABLE "turnos_caja" ADD CONSTRAINT "turnos_caja_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vales" ADD CONSTRAINT "vales_cuenta_fk" FOREIGN KEY ("empresa_id","cuenta_id") REFERENCES "public"."cuentas_tesoreria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turnos_caja_empresa_id_cuenta_id_abierto_index" ON "turnos_caja" USING btree ("empresa_id","cuenta_id","abierto");--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_caja_uno_abierto" ON "turnos_caja" USING btree ("empresa_id","cuenta_id") WHERE "turnos_caja"."estado" = 'abierto';--> statement-breakpoint
CREATE UNIQUE INDEX "vales_empresa_id_numero_index" ON "vales" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "vales_empresa_id_estado_index" ON "vales" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "recibos_empresa_id_turno_id_index" ON "recibos" USING btree ("empresa_id","turno_id");--> statement-breakpoint
ALTER TABLE "movimientos_tesoreria" ADD CONSTRAINT "movimientos_tesoreria_tipo" CHECK ("movimientos_tesoreria"."tipo" in ('saldo_inicial', 'ingreso', 'egreso', 'transferencia', 'deposito_cheque', 'rechazo_cheque', 'acreditacion', 'comision', 'ajuste_arqueo', 'canje_cheque', 'vale', 'rendicion_vale'));