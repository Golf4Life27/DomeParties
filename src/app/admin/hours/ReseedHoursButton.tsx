'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Refreshes ONLY the hours ruleset (safe — no bookings/bays/catalog touched).
export default function ReseedHoursButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!confirm('Replace all hours rules with the current defaults (off-season + in-season)? Bookings, bays and catalog are untouched.')) return
    setBusy(true)
    const res = await fetch('/api/admin/hours/reseed', { method: 'POST' })
    setBusy(false)
    if (res.ok) router.refresh()
    else alert('Could not refresh hours.')
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className="rounded-full bg-black/5 px-4 py-2 text-sm font-medium text-brand-dark transition hover:bg-black/10 disabled:opacity-60"
    >
      {busy ? 'Refreshing…' : 'Load default hours'}
    </button>
  )
}
