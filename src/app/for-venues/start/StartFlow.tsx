'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VenueChat from '../../VenueChat'
import type { VenueProfile } from '@/lib/venue-agent/profile'

type Phase = 'form' | 'building' | 'done'

const box = { border: '1px solid #e4e4e7', borderRadius: 16, padding: 18, background: '#fff', marginBottom: 16 } as const
const label = { display: 'block', margin: '10px 0', fontWeight: 600, fontSize: 14 } as const
const input = { display: 'block', width: '100%', marginTop: 4, padding: '10px 12px', border: '1px solid #d4d4d8', borderRadius: 10, font: 'inherit', fontWeight: 400, boxSizing: 'border-box' } as const
const button = { marginTop: 8, padding: '12px 20px', border: 0, borderRadius: 12, background: '#0f766e', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' } as const

export default function StartFlow({ showTiming }: { showTiming: boolean }) {
  const opened = useRef(0)
  const [website, setWebsite] = useState('')
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<VenueProfile | null>(null)
  const [unsure, setUnsure] = useState<string[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [firstAnswer, setFirstAnswer] = useState<number | null>(null)
  const extra = useMemo(() => ({ profile }), [profile])

  useEffect(() => {
    opened.current = performance.now()
  }, [])

  // Time from opening this page to the chat's first answer, shown on preview copies only, for testing.
  // Preview copies return each reply's usage, which is when the answer has arrived.
  const onCost = useCallback(() => {
    setFirstAnswer((v) => v ?? (performance.now() - opened.current) / 1000)
  }, [])

  async function start() {
    setPhase('building')
    setError(null)
    try {
      const r = await fetch('/api/venue-agent/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ website, email }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.canPaste ? `${j.error} You can paste your prices instead on the full setup page.` : (j.error ?? 'Something went wrong.'))
      const s = await fetch('/api/venue-agent/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: j.profile, email }) })
      const k = await s.json()
      if (!s.ok) throw new Error(k.error ?? 'Something went wrong.')
      setProfile(k.profile ?? j.profile)
      setUnsure(j.unsure ?? [])
      setLink(k.link)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setPhase('form')
    }
  }

  if (phase !== 'done' || !profile || !link) {
    return (
      <form
        style={box}
        onSubmit={(e) => {
          e.preventDefault()
          void start()
        }}
      >
        <label style={label}>
          Your venue’s website
          <input style={input} name="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourvenue.com" required />
        </label>
        <label style={label}>
          Your email
          <input style={input} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourvenue.com" required />
        </label>
        <button type="submit" style={{ ...button, opacity: phase === 'building' ? 0.6 : 1 }} disabled={phase === 'building' || website.trim().length < 4 || !email.includes('@')}>
          {phase === 'building' ? 'Building your chat from your website… about a minute' : 'Start my free month'}
        </button>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      </form>
    )
  }

  return (
    <div data-start="done">
      <section style={{ ...box, borderColor: '#0f766e' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 6px' }}>You’re set up, {profile.name}</h2>
        <p style={{ margin: '0 0 8px' }}>Your party chat is built from your website. This is your own link to it: open it on any device, try it, or send it to your team.</p>
        <p style={{ margin: '0 0 8px', wordBreak: 'break-all' }}>
          <a href={link} data-trial-link target="_blank" rel="noopener noreferrer">
            Open your chat
          </a>{' '}
          <button
            type="button"
            style={{ ...button, marginTop: 0, padding: '4px 12px', fontSize: 14 }}
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true))
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </p>
        <p style={{ margin: 0 }}>
          Your free month starts the day your chat goes on your website. Near its end we’ll ask whether you want to keep it. Nothing switches to paid on its own, and if you don’t say yes, the chat comes off with nothing owed.
        </p>
      </section>

      <section style={box}>
        <h3 style={{ margin: '0 0 6px' }}>Try it as a guest</h3>
        <p style={{ margin: '0 0 8px' }}>Ask what a guest would ask at 11pm. Nothing is sent to anyone.</p>
        <VenueChat venueName={profile.name} welcome={`Hi! Planning a party at ${profile.name}? Tell me the date and how many people.`} endpoint="/api/venue-agent/demo" extra={extra} onCost={showTiming ? onCost : undefined} />
        {showTiming && (
          <p>
            <a href={`/api/venue-agent/selftest?trialcheck=${encodeURIComponent(link.split('?t=')[1] ?? '')}`} target="_blank" rel="noopener noreferrer">
              Preview only: check this chat’s prices against the live website
            </a>
          </p>
        )}
        {showTiming && <p data-timing>{firstAnswer == null ? 'Preview timing: waiting for the first answer' : `Preview timing: ${firstAnswer.toFixed(1)} s from opening the page to the chat’s first answer`}</p>}
      </section>

      {unsure.length > 0 && (
        <section style={box}>
          <h3 style={{ margin: '0 0 6px' }}>We couldn’t find these on your website</h3>
          <p style={{ margin: '0 0 8px' }}>Your chat won’t guess at them. It offers guests a quote from you instead. Reply to our email with any you want added.</p>
          <ul style={{ margin: 0 }}>
            {unsure.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </section>
      )}

      {/* PAYMENT STEP GOES HERE. Not built: there is no payment link for PartyDesk yet, and making one waits on Alex's yes. Nothing is charged on this page. */}
      <section data-payment-placeholder style={{ ...box, borderStyle: 'dashed', background: '#fafafa' }}>
        <h3 style={{ margin: '0 0 6px' }}>Payment</h3>
        <p style={{ margin: 0 }}>Nothing to pay now. We’ll ask for payment details only if you choose to keep your chat after the free month.</p>
      </section>
    </div>
  )
}
