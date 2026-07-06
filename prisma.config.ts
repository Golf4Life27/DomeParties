import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 moves the connection URL out of schema.prisma and into config.
// The CLI (migrate/introspect) reads `datasource.url`; the runtime client uses
// a driver adapter (see src/lib/db.ts). Migrations need a DIRECT (non-pooled)
// connection — on Supabase use the 5432 session URL here and the 6543
// transaction-pooler URL as DATABASE_URL for the app.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
