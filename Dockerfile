# Imagen de producción del ERP.
#   docker build -t erp .
#   docker run --env-file .env -p 3000:3000 erp
# Al arrancar aplica las migraciones pendientes y levanta el servidor; si
# falta configuración, no arranca y dice qué (ver docs/07-produccion.md).

FROM node:24-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS compilacion
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd --system --uid 1001 erp
COPY --from=compilacion --chown=erp /app/package.json ./
COPY --from=compilacion --chown=erp /app/node_modules ./node_modules
COPY --from=compilacion --chown=erp /app/.next ./.next
COPY --from=compilacion --chown=erp /app/public ./public
COPY --from=compilacion --chown=erp /app/drizzle ./drizzle
COPY --from=compilacion --chown=erp /app/scripts/migrar-produccion.mjs /app/scripts/admin-plataforma.mjs ./scripts/
COPY --from=compilacion --chown=erp /app/next.config.ts ./
USER erp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/migrar-produccion.mjs && exec npx next start -p $PORT"]
