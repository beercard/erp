ALTER TABLE "recibos_valores" ADD CONSTRAINT "recibos_valores_empresa_id" UNIQUE("empresa_id","id");--> statement-breakpoint
ALTER TABLE "pagos_valores" DROP CONSTRAINT "pagos_valores_recibo_valor_fk";
--> statement-breakpoint
ALTER TABLE "pagos_valores" ADD CONSTRAINT "pagos_valores_recibo_valor_fk" FOREIGN KEY ("empresa_id","recibo_valor_id") REFERENCES "public"."recibos_valores"("empresa_id","id") ON DELETE no action ON UPDATE no action;
