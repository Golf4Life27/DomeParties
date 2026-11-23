import { z } from 'zod'

// The whole venue product is off unless switched on. On the live site that
// takes VENUE_AGENT=on. On a preview copy of this branch it's on by itself, so it
// can be tried there with the preview-only test key and no setting changed.
// Off, every page and endpoint answers "not found" as if it didn't exist.
export function venueProductOn(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false
  if (process.env.VENUE_AGENT === 'on') return true
  return process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'venue-agent'
}

/** Preview copies share the dome's live database and inbox, so there nothing is ever sent. */
export function isPreview(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}

// Best-effort limits per server instance, enough to stop a loop or a bored
// visitor from running up the model bill.
const buckets = new Map<string, number[]>()
export function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 10000) buckets.clear()
  return recent.length > max
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/** The visible conversation the chat sends with every message. */
export const messagesSchema = z
  .array(z.object({ role: z.enum(['guest', 'agent']), text: z.string().trim().min(1).max(1500) }))
  .min(1)
  .max(40)
  .refine((m) => m[m.length - 1].role === 'guest', 'Last message must be from the guest')
