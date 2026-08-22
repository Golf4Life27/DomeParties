'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AccountForm, { type AccountRow } from './AccountForm'

export default function AccountRowActions({ account }: { account: AccountRow }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function archive() {
    if (!confirm(`Archive ${account.organization ?? account.contactName}? They stop appearing in the list and the reminder stops, but nothing is deleted.`)) return
    setBusy(true)
    await fetch(`/api/admin/accounts?id=${account.id}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  if (editing) {
    // Rendered in a full-width overlay row rather than inside the cell, so the
    // form isn't squeezed into a table column.
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4 sm:p-10">
        <div className="mx-auto max-w-2xl">
          <AccountForm editing={account} onDone={() => setEditing(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end gap-2 whitespace-nowrap">
      <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand hover:underline">
        Edit
      </button>
      <button onClick={archive} disabled={busy} className="text-xs text-foreground/45 hover:text-red-700 disabled:opacity-50">
        Archive
      </button>
    </div>
  )
}
