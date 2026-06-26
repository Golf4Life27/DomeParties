import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 moves the connection URL out of schema.prisma and into config.
// The CLI (migrate/introspect) reads `datasource.url`; the runtime client uses
// a driver adapter (see src/lib/db.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
