import { NextRequest, NextResponse } from 'next/server'
import { runAgent, type AgentResult } from '@/lib/agent/run'
import { readLive } from '@/lib/ygb'

// GET /api/agent/bench?q=quote&reps=1 — preview-only speed test. Runs one
// scripted guest question through each setup in turn, interleaved, so every
// setup is timed against the same minute of service speed, and checks that a
// quoted price matches what price_party returned. Dry mode: nothing is saved.
// Anywhere but a preview deployment this answers 404.

export const maxDuration = 300

// Written for the test, not taken from real guests.
const QUESTIONS: Record<string, string> = {
  quote: 'Hi! Looking to book a birthday party for 12 people on Saturday December 12, around 6pm. What would that cost?',
  open: "Are you open on Saturday December 19? We'd have about 8 people for a few hours in the afternoon.",
  vague: 'Do you guys do corporate events? There would be around 25 of us.',
}

type Variant = { model: string; effort: 'low' | 'medium' | 'high'; legacy?: boolean; speed?: 'fast' }
const VARIANTS: Record<string, Variant> = {
  before: { model: 'claude-opus-5-5', effort: 'medium', legacy: true },
  after: { model: 'claude-opus-5-5', effort: 'medium' },
  after_low: { model: 'claude-opus-5-5', effort: 'low' },
  after_fast: { model: 'claude-opus-5-5', effort: 'medium', speed: 'fast' },
  sonnet_low: { model: 'claude-sonnet-5-5', effort: 'low' },
  haiku_low: { model: 'claude-haiku-5-5', effort: 'low' },
}

// Dollars per million tokens: input, output, cache read, cache write (5 minute).
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5-5:fast': [8, 40, 0.4, 10],
  'claude-sonnet-5-5': [2, 10, 0.1, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
}

function cost(v: Variant, r: AgentResult): number {
  const [i, o, cr, cw] = PRICES[v.speed ? `${v.model}:fast` : v.model]
  const u = r.usage
  return (u.inputTokens * i + u.outputTokens * o + u.cacheReadTokens * cr + u.cacheWriteTokens * cw) / 1e6
}

// The quote is right when the reply names the total and the deposit that
// price_party returned, to the cent.
function quoteCheck(r: AgentResult): string {
  const priced = [...r.trace].reverse().find((t) => t.name === 'price_party')
  if (!priced) return 'no price quoted'
  const p = JSON.parse(priced.result) as { total?: string; deposit_today?: string }
  if (!p.total) return 'price_party error'
  const has = (s?: string) => !!s && r.reply.includes(s.replace(/\.00$/, ''))
  return has(p.total) && has(p.deposit_today) ? `matches (${p.total}, deposit ${p.deposit_today})` : `MISMATCH (tool said ${p.total}, deposit ${p.deposit_today})`
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.DOME_AGENT !== 'on' || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // ?trackman=YYYY-MM-DD times the live occupancy read that check_times does on
  // the live site (dry mode skips it). Read only: nothing is written.
  const tm = req.nextUrl.searchParams.get('trackman')
  if (tm && /^\d{4}-\d{2}-\d{2}$/.test(tm)) {
    const times = []
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const c = await readLive(tm, 0, 1440, 0)
      times.push({ seconds: +((Date.now() - t0) / 1000).toFixed(2), ok: c.ok })
    }
    return NextResponse.json({ trackman: tm, times })
  }
  const qid = req.nextUrl.searchParams.get('q') ?? 'quote'
  const question = QUESTIONS[qid]
  if (!question) return NextResponse.json({ questions: Object.keys(QUESTIONS), variants: Object.keys(VARIANTS) })
  const reps = Math.min(3, Math.max(1, Number(req.nextUrl.searchParams.get('reps') ?? 1)))
  const names = (req.nextUrl.searchParams.get('v') ?? Object.keys(VARIANTS).join(',')).split(',').filter((n) => VARIANTS[n])

  const runs = []
  for (let rep = 0; rep < reps; rep++) {
    for (const name of names) {
      const v = VARIANTS[name]
      const t0 = Date.now()
      try {
        const r = await runAgent([{ role: 'guest', text: question }], {
          mode: 'dry',
          model: v.model,
          effort: v.effort,
          legacy: v.legacy,
          speed: v.speed,
        })
        const row = {
          variant: name,
          rep,
          seconds: +((Date.now() - t0) / 1000).toFixed(1),
          modelSeconds: +(r.modelMs / 1000).toFixed(1),
          toolSeconds: +(r.trace.reduce((s, t) => s + t.ms, 0) / 1000).toFixed(1),
          calls: r.usage.calls,
          tools: r.toolsUsed,
          cost: +cost(v, r).toFixed(4),
          quote: quoteCheck(r),
          usage: r.usage,
          reply: r.reply,
        }
        console.log('[bench]', JSON.stringify({ q: qid, ...row }))
        runs.push(row)
      } catch (e) {
        const row = { variant: name, rep, error: e instanceof Error ? e.message : String(e) }
        console.log('[bench]', JSON.stringify({ q: qid, ...row }))
        runs.push(row)
      }
    }
  }
  return NextResponse.json({ q: qid, question, runs })
}
