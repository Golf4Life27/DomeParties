'use client'

import { useState } from 'react'

type Setting = {
  openHour: number
  closeHour: number
  bayCapacity: number
  bufferMinutes: number
  leadTimeDaysOnline: number
  holdMinutes: number
  staffNotifyEmail: string | null
  depositPercent: number
  serviceChargePct: number
  serviceChargeOnGolf: boolean
  taxPct: number
  peakSurchargePct: number
  offPeakDiscountPct: number
  cardFeePct: number
  cancelHoursLarge: number
  cancelHoursSmall: number
  cancelLargeThreshold: number
}

const FIELDS: { key: keyof Setting; label: string; help?: string; step?: number; kind?: 'text' | 'bool' }[] = [
  { key: 'openHour', label: 'Open hour (0–23)' },
  { key: 'closeHour', label: 'Close hour (1–24)' },
  { key: 'bayCapacity', label: 'Guests per bay' },
  { key: 'bufferMinutes', label: 'Turnover buffer (min)' },
  { key: 'leadTimeDaysOnline', label: 'Online lead time (days)' },
  { key: 'holdMinutes', label: 'Unpaid hold expires after (min)' },
  { key: 'staffNotifyEmail', label: 'Staff notification email (blank = off)', kind: 'text' },
  { key: 'depositPercent', label: 'Deposit %' },
  { key: 'serviceChargePct', label: 'Service charge %' },
  { key: 'serviceChargeOnGolf', label: 'Service charge also on golf/bay charges', kind: 'bool' },
  { key: 'taxPct', label: 'Sales tax %', step: 0.01 },
  { key: 'peakSurchargePct', label: 'Peak surcharge % (flat/per-person pkgs)' },
  { key: 'offPeakDiscountPct', label: 'Off-peak discount %' },
  { key: 'cardFeePct', label: 'Card fee % (0 = off)', step: 0.1 },
  { key: 'cancelLargeThreshold', label: 'Large-party threshold (guests)' },
  { key: 'cancelHoursLarge', label: 'Cancel notice — large (hrs)' },
  { key: 'cancelHoursSmall', label: 'Cancel notice — small (hrs)' },
]

export default function SettingsForm({ setting }: { setting: Setting }) {
  const [values, setValues] = useState<Setting>(setting)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setSaved(false)
    setError(null)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('Could not save. Check the values.')
    }
  }

  return (
    <div className="mt-6 max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-medium text-foreground/80">{f.label}</span>
            {f.kind === 'bool' ? (
              <span className="flex h-[42px] items-center gap-2 rounded-lg border border-black/15 px-3">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4 accent-brand"
                />
                <span className="text-sm text-foreground/70">{values[f.key] ? 'On' : 'Off'}</span>
              </span>
            ) : f.kind === 'text' ? (
              <input
                type="text"
                value={(values[f.key] as string | null) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand"
              />
            ) : (
              <input
                type="number"
                step={f.step ?? 1}
                value={values[f.key] as number}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: f.step ? parseFloat(e.target.value) : parseInt(e.target.value || '0', 10) }))
                }
                className="w-full rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand"
              />
            )}
          </label>
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-sm font-medium text-green-700">✓ Saved</span>}
      </div>
    </div>
  )
}
