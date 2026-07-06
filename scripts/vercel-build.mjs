import { execSync } from 'node:child_process'
const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
if (dbUrl) {
  console.log('[vercel-build] Running prisma migrate deploy…')
  execSync('prisma migrate deploy', { stdio: 'inherit' })
} else {
  console.warn('[vercel-build] ⚠ No DATABASE_URL set — skipping migrations. Set env vars and redeploy.')
}
execSync('next build', { stdio: 'inherit' })
