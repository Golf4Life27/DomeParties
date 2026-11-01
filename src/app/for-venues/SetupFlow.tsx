'use client'

import { useMemo, useState } from 'react'
import VenueChat from '../VenueChat'
import type { VenueProfile } from '@/lib/venue-agent/profile'

// Setup in three short steps: give your website, check what we found, try it.
// The owner never fills in a form beyond two boxes; everything else is read
// from their own site and only needs a yes or a quick fix.

type Draft = { profile: VenueProfile; unsure: string[]; sources: string[] }
const DAYS: [keyof VenueProfile['hours'], string][] = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]

function money(p: VenueProfile, n: number) {
  return new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency }).format(n)
}

function priceLine(p: VenueProfile, pkg: VenueProfile['packages'][number]) {
  const pr = pkg.pricing
  const per = pr.type === 'flat' ? 'flat' : pr.type === 'per_person' ? 'per guest' : `per ${p.unit.singular} per hour`
  return `${money(p, pr.amount)} ${per}${pr.peakAmount != null ? ` (${money(p, pr.peakAmount)} peak)` : ''}`
}

export default function SetupFlow({ origin }: { origin: string }) {
  const [website, setWebsite] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [profile, setProfile] = useState<VenueProfile | null>(null)
  const [name, setName] = useState('')
  const [fixes, setFixes] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const extra = useMemo(() => ({ profile }), [profile])

  async function read() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/venue-agent/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ website, email: email || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.')
      setDraft(j)
      setProfile(j.profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function goLive() {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/venue-agent/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, name, email, plan: 'founding', fixes }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.')
      setDone(j.demo ? 'This is a demo copy, so nothing was sent. On the real site, this is where you’re done.' : 'You’re in. We’ll email you within a day once your chat is switched on.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<VenueProfile>) => profile && setProfile({ ...profile, ...patch })

  if (!draft || !profile) {
    return (
      <form
        className="sf-card"
        onSubmit={(e) => {
          e.preventDefault()
          void read()
        }}
      >
        <h3>Step 1: your website</h3>
        <p>That’s all we need. We read your site and set up your chat for you.</p>
        <label>
          Website
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourvenue.com" required />
        </label>
        <label>
          Your email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourvenue.com" />
        </label>
        <button type="submit" disabled={busy || website.trim().length < 4}>
          {busy ? 'Reading your website… about a minute' : 'Set up my chat'}
        </button>
        {error && <p className="sf-error">{error}</p>}
      </form>
    )
  }

  const p = profile
  const snippet = `<script src="${origin}/venue-chat.js?venue=${p.slug}" async></script>`

  return (
    <div className="sf-grid">
      <div className="sf-card">
        <h3>Step 2: check what we found</h3>
        <p>Fix anything that’s off. Everything your chat says comes from this.</p>
        <label>
          Venue name
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          How many {p.unit.plural} do you have?
          <input
            className="sf-num"
            type="number"
            min={1}
            step={1}
            value={p.unit.count}
            onChange={(e) => set({ unit: { ...p.unit, count: Math.max(1, Math.round(Number(e.target.value) || 1)) } })}
          />
        </label>
        <label>
          Where guests book a party
          <input value={p.booking.partyUrl ?? ''} onChange={(e) => set({ booking: { ...p.booking, partyUrl: e.target.value || null } })} placeholder="No booking page found: we'll send leads to your email" />
        </label>
        <label>
          Leads go to
          <input value={p.handoff.email ?? ''} onChange={(e) => set({ handoff: { ...p.handoff, email: e.target.value || null } })} />
        </label>
        <h4>Hours</h4>
        <ul className="sf-list">
          {DAYS.map(([d, label]) => (
            <li key={d}>
              <span>{label}</span> {(p.hours[d] ?? []).length ? (p.hours[d] ?? []).map((w) => `${w.open}–${w.close}`).join(', ') : 'closed'}
            </li>
          ))}
        </ul>
        <h4>Party packages</h4>
        <ul className="sf-list">
          {p.packages.map((pkg, i) => (
            <li key={pkg.id}>
              <span>{pkg.name}</span> {pkg.durationMinutes / 60} h, {pkg.minGuests}–{pkg.maxGuests} guests,{' '}
              <input
                className="sf-num"
                type="number"
                min={0}
                step="0.01"
                value={pkg.pricing.amount}
                aria-label={`${pkg.name} price`}
                onChange={(e) => {
                  const packages = [...p.packages]
                  packages[i] = { ...pkg, pricing: { ...pkg.pricing, amount: Number(e.target.value) } }
                  set({ packages })
                }}
              />{' '}
              <small>{priceLine(p, pkg)}</small>
            </li>
          ))}
        </ul>
        {draft.unsure.length > 0 && (
          <>
            <h4>We couldn’t find these on your site</h4>
            <ul className="sf-unsure">
              {draft.unsure.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </>
        )}
        <label>
          Anything else we should fix? One sentence is fine.
          <textarea value={fixes} onChange={(e) => setFixes(e.target.value)} rows={2} />
        </label>
      </div>

      <div>
        <div className="sf-card">
          <h3>Step 3: try it as a guest</h3>
          <p>Ask what a guest would ask at 11pm. Nothing is sent to anyone.</p>
          <VenueChat key={JSON.stringify(p).length} venueName={p.name} welcome={`Hi! Planning a party at ${p.name}? Tell me the date and how many people.`} endpoint="/api/venue-agent/demo" extra={extra} />
        </div>
        <div className="sf-card">
          <h3>Step 4: switch it on</h3>
          {done ? (
            <>
              <p>{done}</p>
              <p>Paste this one line on your website, or forward it to whoever runs your site. We can install it for you too.</p>
              <pre className="sf-code">{snippet}</pre>
            </>
          ) : (
            <>
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Your email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button type="button" disabled={busy || !name.trim() || !email.trim()} onClick={() => void goLive()}>
                Start my free month
              </button>
            </>
          )}
          {error && <p className="sf-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
