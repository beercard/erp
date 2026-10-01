CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"usuario_id" uuid,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"antes" jsonb,
	"despues" jsonb,
	"ip" "inet"
);
--> statement-breakpoint
CREATE TABLE "alicuotas_iva" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"porcentaje" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condiciones_iva" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"letra_desde_inscripto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizaciones" (
	"moneda" text NOT NULL,
	"fecha" date NOT NULL,
	"fuente" text NOT NULL,
	"valor" numeric(18, 6) NOT NULL,
	"oficial" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cotizaciones_moneda_fecha_fuente_pk" PRIMARY KEY("moneda","fecha","fuente")
);
--> statement-breakpoint
CREATE TABLE "monedas" (
	"codigo" text PRIMARY KEY NOT NULL,
	"iso" text NOT NULL,
	"nombre" text NOT NULL,
	"simbolo" text NOT NULL,
	CONSTRAINT "monedas_iso_unique" UNIQUE("iso")
);
--> statement-breakpoint
CREATE TABLE "provincias" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"jurisdiccion_cm" smallint NOT NULL,
	CONSTRAINT "provincias_jurisdiccion_cm_unique" UNIQUE("jurisdiccion_cm")
);
--> statement-breakpoint
CREATE TABLE "tipos_documento" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"abreviatura" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"tipo" text DEFAULT 'producto' NOT NULL,
	"rubro_id" uuid,
	"marca_id" uuid,
	"unidad" text DEFAULT 'unidad' NOT NULL,
	"alicuota_iva" smallint DEFAULT 5 NOT NULL,
	"lleva_stock" boolean DEFAULT true NOT NULL,
	"lleva_serie" boolean DEFAULT false NOT NULL,
	"codigo_barras" text,
	"costo" numeric(18, 4),
	"moneda_costo" text DEFAULT 'PES' NOT NULL,
	"stock_minimo" numeric(18, 4),
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articulos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "condiciones_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"dias" smallint DEFAULT 0 NOT NULL,
	"cuotas" smallint DEFAULT 1 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condiciones_pago_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "depositos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"domicilio" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depositos_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "listas_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"moneda" text DEFAULT 'PES' NOT NULL,
	"incluye_iva" boolean DEFAULT false NOT NULL,
	"lista_base_id" uuid,
	"porcentaje" numeric(18, 4),
	"vigente_hasta" date,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listas_precios_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marcas_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"lista_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"precio" numeric(18, 4) NOT NULL,
	"vigente_desde" date DEFAULT now() NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puntos_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"numero" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"deposito_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "puntos_venta_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "rubros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"padre_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubros_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "terceros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"es_cliente" boolean DEFAULT true NOT NULL,
	"es_proveedor" boolean DEFAULT false NOT NULL,
	"tipo_documento" smallint NOT NULL,
	"numero_documento" text,
	"condicion_iva" smallint NOT NULL,
	"iibb_regimen" text,
	"iibb_numero" text,
	"email" text,
	"telefono" text,
	"domicilio" text,
	"localidad" text,
	"codigo_postal" text,
	"provincia" text,
	"lista_precios_id" uuid,
	"vendedor_id" uuid,
	"condicion_pago_id" uuid,
	"zona_id" uuid,
	"transporte_id" uuid,
	"descuento" numeric(18, 4),
	"limite_credito" numeric(18, 2),
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terceros_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "terceros_contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cargo" text,
	"email" text,
	"telefono" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transportes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"cuit" text,
	"telefono" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transportes_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"usuario_id" uuid,
	"comision_venta" numeric(18, 4) DEFAULT '0' NOT NULL,
	"comision_cobranza" numeric(18, 4) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendedores_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "zonas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zonas_empresa_id" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"cuit" text NOT NULL,
	"condicion_iva" smallint NOT NULL,
	"iibb_numero" text,
	"iibb_regimen" text,
	"inicio_actividades" date,
	"domicilio_fiscal" text,
	"localidad" text,
	"codigo_postal" text,
	"provincia" text,
	"moneda_funcional" text DEFAULT 'PES' NOT NULL,
	"modulos" text[] DEFAULT '{}'::text[] NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cuit_unique" UNIQUE("cuit")
);
--> statement-breakpoint
CREATE TABLE "membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"rol_id" uuid NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"nombre" text NOT NULL,
	"descripcion" text,
	"permisos" text[] NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash_token" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid,
	"vence" timestamp with time zone NOT NULL,
	"ip" "inet",
	"navegador" text,
	"creada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesiones_hash_token_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"hash_clave" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_ingreso" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_alicuota_iva_alicuotas_iva_codigo_fk" FOREIGN KEY ("alicuota_iva") REFERENCES "public"."alicuotas_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_moneda_costo_monedas_codigo_fk" FOREIGN KEY ("moneda_costo") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_rubro_fk" FOREIGN KEY ("empresa_id","rubro_id") REFERENCES "public"."rubros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_marca_fk" FOREIGN KEY ("empresa_id","marca_id") REFERENCES "public"."marcas"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_base_fk" FOREIGN KEY ("empresa_id","lista_base_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_lista_fk" FOREIGN KEY ("empresa_id","lista_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_articulo_fk" FOREIGN KEY ("empresa_id","articulo_id") REFERENCES "public"."articulos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntos_venta" ADD CONSTRAINT "puntos_venta_deposito_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubros" ADD CONSTRAINT "rubros_padre_fk" FOREIGN KEY ("empresa_id","padre_id") REFERENCES "public"."rubros"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_tipo_documento_tipos_documento_codigo_fk" FOREIGN KEY ("tipo_documento") REFERENCES "public"."tipos_documento"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_provincia_provincias_codigo_fk" FOREIGN KEY ("provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_lista_fk" FOREIGN KEY ("empresa_id","lista_precios_id") REFERENCES "public"."listas_precios"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_vendedor_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_condicion_pago_fk" FOREIGN KEY ("empresa_id","condicion_pago_id") REFERENCES "public"."condiciones_pago"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_zona_fk" FOREIGN KEY ("empresa_id","zona_id") REFERENCES "public"."zonas"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_transporte_fk" FOREIGN KEY ("empresa_id","transporte_id") REFERENCES "public"."transportes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros_contactos" ADD CONSTRAINT "terceros_contactos_tercero_fk" FOREIGN KEY ("empresa_id","tercero_id") REFERENCES "public"."terceros"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_provincia_provincias_codigo_fk" FOREIGN KEY ("provincia") REFERENCES "public"."provincias"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_moneda_funcional_monedas_codigo_fk" FOREIGN KEY ("moneda_funcional") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_rol_id_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_empresa_id_entidad_entidad_id_index" ON "auditoria" USING btree ("empresa_id","entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_id_fecha_index" ON "auditoria" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "cotizaciones_moneda_fecha_index" ON "cotizaciones" USING btree ("moneda","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "articulos_empresa_id_codigo_index" ON "articulos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "articulos_empresa_id_nombre_index" ON "articulos" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "condiciones_pago_empresa_id_nombre_index" ON "condiciones_pago" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "depositos_empresa_id_codigo_index" ON "depositos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "listas_precios_empresa_id_codigo_index" ON "listas_precios" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_empresa_id_nombre_index" ON "marcas" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "precios_empresa_id_lista_id_articulo_id_vigente_desde_index" ON "precios" USING btree ("empresa_id","lista_id","articulo_id","vigente_desde");--> statement-breakpoint
CREATE UNIQUE INDEX "puntos_venta_empresa_id_numero_index" ON "puntos_venta" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE INDEX "rubros_empresa_id_padre_id_index" ON "rubros" USING btree ("empresa_id","padre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terceros_empresa_id_codigo_index" ON "terceros" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "terceros_empresa_id_numero_documento_index" ON "terceros" USING btree ("empresa_id","numero_documento");--> statement-breakpoint
CREATE INDEX "terceros_empresa_id_razon_social_index" ON "terceros" USING btree ("empresa_id","razon_social");--> statement-breakpoint
CREATE INDEX "terceros_contactos_empresa_id_tercero_id_index" ON "terceros_contactos" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transportes_empresa_id_nombre_index" ON "transportes" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_empresa_id_codigo_index" ON "vendedores" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "zonas_empresa_id_nombre_index" ON "zonas" USING btree ("empresa_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "membresias_usuario_id_empresa_id_index" ON "membresias" USING btree ("usuario_id","empresa_id");--> statement-breakpoint
CREATE INDEX "roles_empresa_id_index" ON "roles" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_id_index" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree (lower("email"));