import { execSync } from 'node:child_process'
const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
// Preview builds share the live database. Letting them run migrations meant an
// unmerged branch could change the live schema (an old preview did exactly
// that). Only production builds migrate, unless a preview opts in on purpose.
const isPreview = process.env.VERCEL_ENV === 'preview'
if (dbUrl && isPreview && process.env.RUN_PREVIEW_MIGRATIONS !== '1') {
  console.log('[vercel-build] Preview build: skipping prisma migrate deploy (shared live database).')
} else if (dbUrl) {
  console.log('[vercel-build] Running prisma migrate deploy…')
  execSync('prisma migrate deploy', { stdio: 'inherit' })
} else {
  console.warn('[vercel-build] ⚠ No DATABASE_URL set — skipping migrations. Set env vars and redeploy.')
}
execSync('next build', { stdio: 'inherit' })
