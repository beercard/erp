import { defineConfig } from 'drizzle-kit'

/**
 * Solo se usa para GENERAR migraciones (`npm run db:generar`), que se revisan
 * y se versionan en drizzle/. Nunca se sincroniza el esquema directo contra
 * una base: se aplican las migraciones con `npm run db:migrar`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
})
