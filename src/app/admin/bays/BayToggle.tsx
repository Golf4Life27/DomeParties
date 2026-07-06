'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function BayToggle({
  id,
  field,
  value,
  onLabel,
  offLabel,
}: {
  id: string
  field: 'exclusive' | 'active'
  value: boolean
  onLabel: string
  offLabel: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [on, setOn] = useState(value)

  async function toggle() {
    setBusy(true)
    const next = !on
    const res = await fetch(`/api/admin/resources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setBusy(false)
    if (res.ok) {
      setOn(next)
      router.refresh()
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ${
        on ? 'bg-brand text-white ring-brand' : 'bg-white ring-black/15 hover:ring-brand'
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  )
}
