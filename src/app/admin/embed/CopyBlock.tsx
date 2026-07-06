'use client'

import { useState } from 'react'

export default function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-brand-dark p-4 text-xs text-white/90">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-white/15 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/25"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}
