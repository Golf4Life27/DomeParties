'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type FieldType = 'text' | 'textarea' | 'int' | 'money' | 'bool' | 'select' | 'stringlist' | 'intlist'

export type FieldDef = {
  key: string
  label: string
  type?: FieldType // defaults to 'text'
  options?: { value: string; label: string }[]
  full?: boolean
}

type Item = Record<string, unknown> & { id?: string }

export default function CatalogEditor({
  endpoint,
  fields,
  items,
  blank,
  noun,
}: {
  endpoint: string
  fields: FieldDef[]
  items: Item[]
  blank: Item
  noun: string
}) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="mt-6 space-y-4">
      {items.map((it) => (
        <Editor key={it.id} endpoint={endpoint} fields={fields} item={it} noun={noun} />
      ))}

      {creating ? (
        <Editor
          endpoint={endpoint}
          fields={fields}
          item={blank}
          noun={noun}
          isNew
          onDone={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          + Add {noun}
        </button>
      )}
    </div>
  )
}

function Editor({
  endpoint,
  fields,
  item,
  noun,
  isNew,
  onDone,
}: {
  endpoint: string
  fields: FieldDef[]
  item: Item
  noun: string
  isNew?: boolean
  onDone?: () => void
}) {
  const router = useRouter()
  const [v, setV] = useState<Item>(item)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = v.active !== false

  function set(key: string, value: unknown) {
    setV((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setBusy(true)
    setError(null)
    const res = await fetch(isNew ? endpoint : `${endpoint}/${item.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      onDone?.()
      router.refresh()
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError('Save failed — check the fields.')
    }
  }

  async function remove() {
    if (!confirm(`Delete this ${noun}? (If it's used by a booking, it will be deactivated instead.)`)) return
    setBusy(true)
    await fetch(`${endpoint}/${item.id}`, { method: 'DELETE' })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${!active ? 'opacity-60' : ''}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.full || f.type === 'textarea' || f.type === 'stringlist' ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-xs font-medium text-foreground/70">{f.label}</label>
            <FieldInput field={f} value={v[f.key]} onChange={(val) => set(f.key, val)} />
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Saving…' : isNew ? `Create ${noun}` : 'Save'}
        </button>
        {!isNew && (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
        {isNew && onDone && (
          <button onClick={onDone} className="text-sm text-foreground/60 hover:underline">
            Cancel
          </button>
        )}
        {saved && <span className="text-sm font-medium text-green-700">✓ Saved</span>}
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const base = 'w-full rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand'
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          rows={2}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )
    case 'stringlist':
      return (
        <textarea
          rows={4}
          placeholder="One item per line"
          value={Array.isArray(value) ? (value as string[]).join('\n') : ''}
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          className={base}
        />
      )
    case 'intlist':
      return (
        <input
          type="text"
          placeholder="e.g. 1,2,3,4"
          value={Array.isArray(value) ? (value as number[]).join(',') : ''}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(/[,\s]+/)
                .map((s) => parseInt(s, 10))
                .filter((n) => !Number.isNaN(n)),
            )
          }
          className={base}
        />
      )
    case 'money':
      return (
        <div className="flex items-center">
          <span className="mr-1 text-foreground/50">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={typeof value === 'number' ? (value / 100).toString() : ''}
            onChange={(e) => onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
            className={base}
          />
        </div>
      )
    case 'int':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
          className={base}
        />
      )
    case 'bool':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value !== false} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-foreground/70">Yes</span>
        </label>
      )
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )
  }
}
