'use client'

import { useState } from 'react'

export default function InviteLink({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/invite/${bookingId}` : `/invite/${bookingId}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        readOnly
        value={url}
        className="flex-1 rounded-lg border border-white/20 bg-surface px-3 py-2 text-sm text-foreground/70"
      />
      <button
        onClick={copy}
        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dark"
      >
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
    </div>
  )
}
