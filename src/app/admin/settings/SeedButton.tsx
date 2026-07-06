'use client'

import { useState } from 'react'

// One-click catalog load for fresh deployments (calls the admin seed endpoint).
export default function SeedButton({ hasCatalog }: { hasCatalog: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function seed() {
    if (hasCatalog && !confirm('Reload the catalog? This resets packages, rates, F&B, add-ons, and bays to the card defaults.')) return
    setBusy(true)
    setResult(null)
    const res = await fetch('/api/admin/seed', { method: 'POST' })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (res.ok) {
      setResult(`✓ Catalog loaded: ${data.counts.packages} packages, ${data.counts.fnb} F&B, ${data.counts.addOns} add-ons, ${data.counts.resources} bays`)
      setTimeout(() => window.location.reload(), 1500)
    } else {
      setResult(`✗ ${data?.error ?? 'Seed failed'}`)
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold text-brand-dark">Catalog</h2>
      <p className="mt-1 text-sm text-foreground/60">
        {hasCatalog
          ? 'Reload the packages, bay rates, food & drink, add-ons, and bays from the party-card defaults.'
          : 'Fresh deployment? Load the packages, bay rates, food & drink, add-ons, and bays with one click.'}
      </p>
      <button
        onClick={seed}
        disabled={busy}
        className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? 'Loading…' : hasCatalog ? 'Reload catalog' : 'Load catalog'}
      </button>
      {result && <p className="mt-3 text-sm font-medium">{result}</p>}
    </div>
  )
}
