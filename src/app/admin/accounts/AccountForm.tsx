'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type AccountRow = {
  id: string
  contactName: string
  organization: string | null
  contactRole: string | null
  email: string | null
  phone: string | null
  kind: string
  typicalMonth: number | null
  lastEventOn: string | null
  lastEventValue: number | null
  lastHeadcount: number | null
  timesBooked: number
  relationshipOwner: string | null
  notes: string | null
}

const KINDS = [
  ['FUNDRAISER', 'Fundraiser'],
  ['CORPORATE', 'Corporate'],
  ['CHAMBER', 'Chamber'],
  ['BOOSTER', 'School / booster'],
  ['MILESTONE', 'Milestone birthday'],
  ['OTHER', 'Other'],
]
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const empty: Omit<AccountRow, 'id'> & { id?: string } = {
  contactName: '', organization: '', contactRole: '', email: '', phone: '',
  kind: 'OTHER', typicalMonth: null, lastEventOn: '', lastEventValue: null,
  lastHeadcount: null, timesBooked: 1, relationshipOwner: '', notes: '',
}

export default function AccountForm({ editing, onDone }: { editing?: AccountRow; onDone?: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(!!editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<Record<string, unknown>>(() =>
    editing
      ? { ...editing, lastEventValue: editing.lastEventValue != null ? (editing.lastEventValue / 100).toFixed(2) : '' }
      : { ...empty },
  )

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }))
  const str = (k: string) => (f[k] == null ? '' : String(f[k]))

  async function save() {
    setError(null)
    if (!str('contactName').trim()) { setError('A contact name is required.'); return }
    setBusy(true)
    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.details?.[0]?.message ?? 'Could not save.')
      return
    }
    if (!editing) setF({ ...empty })
    setOpen(!!editing ? false : false)
    onDone?.()
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
      >
        + Add an account
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold text-brand-dark">{editing ? 'Edit account' : 'New account'}</h2>
      <p className="mt-1 text-xs text-foreground/60">
        Everything except the contact name is optional — save what you know now and fill the rest in later.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Contact name *"><input className={input} value={str('contactName')} onChange={(e) => set('contactName', e.target.value)} placeholder="Jane Doe" /></Field>
        <Field label="Organization"><input className={input} value={str('organization')} onChange={(e) => set('organization', e.target.value)} placeholder="Plainfield Shorewood Chamber" /></Field>
        <Field label="Their role" hint="The seat, which rotates">
          <input className={input} value={str('contactRole')} onChange={(e) => set('contactRole', e.target.value)} placeholder="Committee chair" />
        </Field>
        <Field label="Type">
          <select className={input} value={str('kind')} onChange={(e) => set('kind', e.target.value)}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Email"><input className={input} value={str('email')} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><input className={input} value={str('phone')} onChange={(e) => set('phone', e.target.value)} /></Field>

        <Field label="Event month" hint="Drives the reminder, ~10 weeks ahead">
          <select className={input} value={f.typicalMonth == null ? '' : String(f.typicalMonth)} onChange={(e) => set('typicalMonth', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Not sure</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Times booked"><input type="number" min={1} className={input} value={str('timesBooked')} onChange={(e) => set('timesBooked', e.target.value)} /></Field>

        <Field label="Last event date"><input type="date" className={input} value={str('lastEventOn').slice(0, 10)} onChange={(e) => set('lastEventOn', e.target.value)} /></Field>
        <Field label="Last event value" hint="Dollars"><input className={input} value={str('lastEventValue')} onChange={(e) => set('lastEventValue', e.target.value)} placeholder="12400" /></Field>
        <Field label="Headcount"><input type="number" min={1} className={input} value={str('lastHeadcount')} onChange={(e) => set('lastHeadcount', e.target.value)} /></Field>
        <Field label="Owned by" hint="Who here keeps the relationship"><input className={input} value={str('relationshipOwner')} onChange={(e) => set('relationshipOwner', e.target.value)} placeholder="Alex" /></Field>

        <div className="sm:col-span-2">
          <Field label="Notes" hint="Anything the next person needs — including events at the golf course, which this tracker doesn't cover">
            <textarea rows={3} className={input} value={str('notes')} onChange={(e) => set('notes', e.target.value)} placeholder="Also runs a summer outing at the course. Wanted a carving station last year." />
          </Field>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={save} disabled={busy} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => { setOpen(false); onDone?.() }} className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 ring-1 ring-black/10 hover:bg-black/5">
          Cancel
        </button>
      </div>
    </div>
  )
}

const input = 'w-full rounded-lg border border-black/15 px-3 py-2 text-sm'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-foreground/50">{hint}</span>}
    </label>
  )
}
