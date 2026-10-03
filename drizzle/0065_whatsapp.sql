CREATE TABLE "facturas_recibidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"origen" text DEFAULT 'whatsapp' NOT NULL,
	"usuario_id" uuid,
	"conversacion_id" uuid,
	"archivo" "bytea" NOT NULL,
	"tipo_archivo" text NOT NULL,
	"nombre_archivo" text,
	"estado" text DEFAULT 'leyendo' NOT NULL,
	"datos" jsonb,
	"error" text,
	"proveedor_id" uuid,
	"compra_id" uuid,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facturas_recibidas_estado" CHECK ("facturas_recibidas"."estado" in ('leyendo', 'lista', 'registrada', 'descartada', 'error'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_autorizados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"telefono" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"telefono" text NOT NULL,
	"nombre" text,
	"tercero_id" uuid,
	"usuario_id" uuid,
	"atiende" text DEFAULT 'agente' NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"asignado_a" uuid,
	"ultimo_entrante" timestamp with time zone,
	"ultimo_mensaje" timestamp with time zone,
	"resumen" text,
	"no_leidos" integer DEFAULT 0 NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversaciones_empresa_id" UNIQUE("empresa_id","id"),
	CONSTRAINT "whatsapp_conversaciones_atiende" CHECK ("whatsapp_conversaciones"."atiende" in ('agente', 'humano')),
	CONSTRAINT "whatsapp_conversaciones_estado" CHECK ("whatsapp_conversaciones"."estado" in ('abierta', 'cerrada'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero_id" text NOT NULL,
	"numero" text,
	"nombre_verificado" text,
	"token" text NOT NULL,
	"secreto_app" text NOT NULL,
	"token_verificacion" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"plantilla" text,
	"idioma" text DEFAULT 'es_AR' NOT NULL,
	"agente" boolean DEFAULT false NOT NULL,
	"instrucciones" text,
	"registro_facturas" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_cuentas_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"conversacion_id" uuid NOT NULL,
	"direccion" text NOT NULL,
	"autor" text NOT NULL,
	"usuario_id" uuid,
	"tipo" text DEFAULT 'text' NOT NULL,
	"texto" text,
	"medio" jsonb,
	"externo_id" text,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"error" text,
	"datos" jsonb,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_mensajes_direccion" CHECK ("whatsapp_mensajes"."direccion" in ('entrante', 'saliente'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_numeros" (
	"clave" text PRIMARY KEY NOT NULL,
	"numero_id" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_numeros_numero_id_unique" UNIQUE("numero_id"),
	CONSTRAINT "whatsapp_numeros_empresa_id_unique" UNIQUE("empresa_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversaciones" ADD CONSTRAINT "whatsapp_conversaciones_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE SET NULL ("tercero_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_mensajes" ADD CONSTRAINT "whatsapp_mensajes_conversacion_fk" FOREIGN KEY ("empresa_id","conversacion_id") REFERENCES "public"."whatsapp_conversaciones"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_numeros" ADD CONSTRAINT "whatsapp_numeros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facturas_recibidas_empresa_id_estado_creado_index" ON "facturas_recibidas" USING btree ("empresa_id","estado","creado");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_autorizados_telefono" ON "whatsapp_autorizados" USING btree ("empresa_id","telefono");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversaciones_telefono" ON "whatsapp_conversaciones" USING btree ("empresa_id","telefono");--> statement-breakpoint
CREATE INDEX "whatsapp_conversaciones_empresa_id_ultimo_mensaje_index" ON "whatsapp_conversaciones" USING btree ("empresa_id","ultimo_mensaje");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_cuentas_empresa" ON "whatsapp_cuentas" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_mensajes_externo" ON "whatsapp_mensajes" USING btree ("empresa_id","externo_id");--> statement-breakpoint
CREATE INDEX "whatsapp_mensajes_empresa_id_conversacion_id_creado_index" ON "whatsapp_mensajes" USING btree ("empresa_id","conversacion_id","creado");