'use client'
import { useState } from 'react'
import type { VenueProfile } from '@/lib/venue-agent/profile'
import type { PlanId, PlanOffer } from '@/lib/venue-agent/plans'

// The last step, on the owner's own demo page: pick a plan, leave a name and
// email, and get the one line for their website. Nothing to set up again,
// because the demo they just tried is the setup.
export default function SwitchOn({ profile, plans, origin }: { profile: VenueProfile; plans: PlanOffer[]; origin: string }) {
  const [plan, setPlan] = useState<PlanId>(plans[0].id)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fixes, setFixes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const snippet = `<script src="${origin}/venue-chat.js?venue=${profile.slug}" async></script>`

  async function goLive() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/venue-agent/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile: { ...profile, prospect: false }, name, email, plan, fixes }),
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

  const chosen = plans.find((p) => p.id === plan) ?? plans[0]
  return (
    <section style={{ border: '1px solid #e4e4e7', borderRadius: 16, padding: 18, marginTop: 24 }}>
      <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>Put this chat on your website</h2>
      {done ? (
        <>
          <p>{done}</p>
          <p>Paste this one line on your website, or forward it to whoever runs your site. We can install it for you too.</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f4f4f5', padding: 12, borderRadius: 10, fontSize: 13 }}>{snippet}</pre>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 8px' }}>It goes live as you see it here. No call, no new setup.</p>
          {plans.map((p) => (
            <label key={p.id} style={{ display: 'block', padding: '8px 0', borderTop: '1px solid #f4f4f5' }}>
              <input type="radio" name="plan" checked={plan === p.id} onChange={() => setPlan(p.id)} /> <strong>{p.name}: {p.price}.</strong> {p.line}
            </label>
          ))}
          <label style={{ display: 'block', margin: '10px 0', fontWeight: 600, fontSize: 14 }}>
            Anything it got wrong? (optional)
            <textarea value={fixes} onChange={(e) => setFixes(e.target.value)} rows={2} style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
          </label>
          <label style={{ display: 'block', margin: '10px 0', fontWeight: 600, fontSize: 14 }}>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
          </label>
          <label style={{ display: 'block', margin: '10px 0', fontWeight: 600, fontSize: 14 }}>
            Your email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim() || !email.trim()}
            onClick={() => void goLive()}
            style={{ padding: '12px 20px', border: 0, borderRadius: 12, background: '#0f766e', color: '#fff', fontWeight: 600 }}
          >
            {chosen.id === 'pilot' ? 'Start my 60-day pilot' : 'Start my free month'}
          </button>
          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        </>
      )}
    </section>
  )
}
