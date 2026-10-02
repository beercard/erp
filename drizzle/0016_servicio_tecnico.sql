CREATE TABLE "ordenes_servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"equipo_id" uuid,
	"contrato_id" uuid,
	"tipo" text DEFAULT 'correctivo' NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"falla" text NOT NULL,
	"contacto" text,
	"telefono" text,
	"domicilio" text,
	"tecnico_id" uuid,
	"programada" date,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"cobertura" text DEFAULT 'cargo' NOT NULL,
	"solucion" text,
	"fecha_resolucion" date,
	"contador" bigint,
	"motivo_cancelacion" text,
	"comprobante_id" uuid,
	"observaciones" text,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordenes_servicio_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "ordenes_servicio_tipo" CHECK ("ordenes_servicio"."tipo" in ('correctivo', 'preventivo', 'instalacion', 'retiro', 'insumos')),
	CONSTRAINT "ordenes_servicio_prioridad" CHECK ("ordenes_servicio"."prioridad" in ('normal', 'urgente')),
	CONSTRAINT "ordenes_servicio_estado" CHECK ("ordenes_servicio"."estado" in ('pendiente', 'asignada', 'resuelta', 'cancelada')),
	CONSTRAINT "ordenes_servicio_cobertura" CHECK ("ordenes_servicio"."cobertura" in ('contrato', 'garantia', 'cargo')),
	CONSTRAINT "ordenes_servicio_resuelta" CHECK (("ordenes_servicio"."estado" = 'resuelta') = ("ordenes_servicio"."fecha_resolucion" is not null) and ("ordenes_servicio"."estado" <> 'resuelta' or "ordenes_servicio"."solucion" is not null))
);
--> statement-breakpoint
CREATE TABLE "ordenes_servicio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(18, 4) NOT NULL,
	"deposito_id" uuid,
	"precio_unitario" numeric(18, 4) DEFAULT '0' NOT NULL,
	"alicuota_iva" smallint DEFAULT 5 NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordenes_servicio_items_cantidad" CHECK ("ordenes_servicio_items"."cantidad" > 0 and "ordenes_servicio_items"."precio_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ordenes_servicio_visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tecnico_id" uuid,
	"horas" numeric(18, 4) DEFAULT '0' NOT NULL,
	"detalle" text NOT NULL,
	"usuario_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordenes_servicio_visitas_horas" CHECK ("ordenes_servicio_visitas"."horas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tecnicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"email" text,
	"usuario_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tecnicos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
ALTER TABLE "lecturas" DROP CONSTRAINT "lecturas_origen";--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_equipo_fk" FOREIGN KEY ("empresa_id","equipo_id") REFERENCES "public"."equipos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_contrato_fk" FOREIGN KEY ("empresa_id","contrato_id") REFERENCES "public"."contratos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio" ADD CONSTRAINT "ordenes_servicio_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_items" ADD CONSTRAINT "ordenes_servicio_items_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_items" ADD CONSTRAINT "ordenes_servicio_items_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_items" ADD CONSTRAINT "ordenes_servicio_items_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_items" ADD CONSTRAINT "ordenes_servicio_items_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_visitas" ADD CONSTRAINT "ordenes_servicio_visitas_orden_fk" FOREIGN KEY ("empresa_id","orden_id") REFERENCES "public"."ordenes_servicio"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_servicio_visitas" ADD CONSTRAINT "ordenes_servicio_visitas_tecnico_fk" FOREIGN KEY ("empresa_id","tecnico_id") REFERENCES "public"."tecnicos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_servicio_empresa_id_numero_index" ON "ordenes_servicio" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_empresa_id_estado_index" ON "ordenes_servicio" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_empresa_id_tercero_id_index" ON "ordenes_servicio" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_empresa_id_equipo_id_index" ON "ordenes_servicio" USING btree ("empresa_id","equipo_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_empresa_id_tecnico_id_index" ON "ordenes_servicio" USING btree ("empresa_id","tecnico_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_items_empresa_id_orden_id_index" ON "ordenes_servicio_items" USING btree ("empresa_id","orden_id");--> statement-breakpoint
CREATE INDEX "ordenes_servicio_visitas_empresa_id_orden_id_index" ON "ordenes_servicio_visitas" USING btree ("empresa_id","orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tecnicos_empresa_id_codigo_index" ON "tecnicos" USING btree ("empresa_id","codigo");--> statement-breakpoint
ALTER TABLE "lecturas" ADD CONSTRAINT "lecturas_origen" CHECK ("lecturas"."origen" in ('manual', 'archivo', 'mps', 'pymexis', 'tecnico'));