'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'
import PaymentStep from './PaymentStep'

// ---- Types (mirror the catalog API) ---------------------------------------
type Pkg = {
  id: string
  name: string
  tier: string
  description: string
  includes: string[]
  durationMinutes: number
  pricingType: 'PER_PERSON' | 'FLAT'
  pricePerPerson: number
  flatPrice: number
  minGuests: number
  maxGuests: number
  popular: boolean
}
type Fnb = {
  id: string
  name: string
  description: string
  pricingType: 'PER_PERSON' | 'FLAT'
  price: number
  dietaryNotes?: string | null
}
type AddOn = {
  id: string
  name: string
  description: string
  category: string
  price: number
  unit: 'FLAT' | 'PER_PERSON' | 'PER_30_MIN'
}
type Setting = {
  bayCapacity: number
  leadTimeDaysOnline: number
  depositPercent: number
  serviceChargePct: number
  taxPct: number
  cancelHoursLarge: number
  cancelHoursSmall: number
  cancelLargeThreshold: number
}
type Slot = {
  startMinutes: number
  endMinutes: number
  label: string
  availableBays: number
  peak: boolean
}
type Quote = {
  baysNeeded: number
  durationMinutes: number
  lines: { label: string; detail?: string; amount: number }[]
  total: number
  depositAmount: number
  depositPercent: number
  balanceDue: number
  perPersonEffective: number
  serviceChargePct: number
  taxPct: number
}

const EVENT_TYPES = [
  { key: 'BIRTHDAY', label: '🎂 Birthday', instant: true },
  { key: 'GROUP', label: '🎉 Group hangout', instant: true },
  { key: 'CORPORATE', label: '💼 Corporate', instant: false },
  { key: 'LEAGUE', label: '🏆 League', instant: false },
  { key: 'OTHER', label: '✨ Something else', instant: false },
] as const

const STEPS = ['Start', 'Package', 'Date & time', 'Food & drink', 'Add-ons', 'Your details', 'Pay']

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysStr(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function BookPage() {
  const [step, setStep] = useState(0)
  const [catalog, setCatalog] = useState<{
    setting: Setting
    packages: Pkg[]
    fnb: Fnb[]
    addOns: AddOn[]
  } | null>(null)

  // selections
  const [eventType, setEventType] = useState<string>('BIRTHDAY')
  const [email, setEmail] = useState('')
  const [partySize, setPartySize] = useState(12)
  const [packageId, setPackageId] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [startMinutes, setStartMinutes] = useState<number | null>(null)
  const [fnbPackageId, setFnbPackageId] = useState<string | null>(null)
  const [addOns, setAddOns] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [waiverSigned, setWaiverSigned] = useState(false)
  const [waiverName, setWaiverName] = useState('')
  const [waiverGuardian, setWaiverGuardian] = useState(false)

  const [draftId, setDraftId] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<{
    mode: 'dev' | 'stripe' | 'covered'
    clientSecret: string | null
    depositAmount: number
  } | null>(null)
  const [giftCode, setGiftCode] = useState('')
  const [giftApplied, setGiftApplied] = useState(0)
  const [giftError, setGiftError] = useState<string | null>(null)

  // Load catalog
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setError('Could not load packages. Please refresh.'))
  }, [])

  // Resume an abandoned cart from a recovery link (?draft=<id>)
  useEffect(() => {
    const draft = new URLSearchParams(window.location.search).get('draft')
    if (!draft) return
    fetch(`/api/bookings/${draft}`)
      .then((r) => r.json())
      .then(({ booking }) => {
        if (!booking || booking.status !== 'DRAFT') return
        setDraftId(booking.id)
        if (booking.customerEmail) setEmail(booking.customerEmail)
        if (booking.eventType) setEventType(booking.eventType)
        if (booking.partySize) setPartySize(booking.partySize)
        if (booking.packageId) setPackageId(booking.packageId)
        const ds = booking.date?.slice(0, 10)
        const hasDate = ds && ds !== '1970-01-01'
        if (hasDate) setDateStr(ds)
        if (booking.startMinutes) setStartMinutes(booking.startMinutes)
        setFnbPackageId(booking.fnbPackageId ?? null)
        if (booking.addOns?.length) {
          const m: Record<string, number> = {}
          for (const a of booking.addOns) m[a.addOnId] = a.quantity
          setAddOns(m)
        }
        if (booking.customerName) setName(booking.customerName)
        if (booking.customerPhone) setPhone(booking.customerPhone)
        // Resume at the first incomplete step.
        setStep(!booking.packageId ? 1 : 2)
      })
      .catch(() => {})
  }, [])

  // When resuming onto the date step with a saved date, (re)load its slots.
  useEffect(() => {
    if (step === 2 && dateStr && packageId && slots.length === 0 && !slotsLoading) {
      loadSlots(dateStr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const selectedPkg = useMemo(
    () => catalog?.packages.find((p) => p.id === packageId) ?? null,
    [catalog, packageId],
  )

  const addOnSelections = useMemo(
    () => Object.entries(addOns).filter(([, q]) => q > 0).map(([addOnId, quantity]) => ({ addOnId, quantity })),
    [addOns],
  )

  // Live quote whenever core selections change
  useEffect(() => {
    if (!packageId) return
    const controller = new AbortController()
    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partySize,
        packageId,
        fnbPackageId,
        addOns: addOnSelections,
        dateStr: dateStr || null,
        startMinutes,
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => d.quote && setQuote(d.quote))
      .catch(() => {})
    return () => controller.abort()
  }, [packageId, partySize, fnbPackageId, addOnSelections, dateStr, startMinutes])

  const patchDraft = useCallback(
    async (fields: Record<string, unknown>) => {
      if (!draftId) return
      await fetch(`/api/bookings/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
    },
    [draftId],
  )

  const minDate = catalog ? addDaysStr(todayLocal(), catalog.setting.leadTimeDaysOnline) : todayLocal()

  // ---- Step actions -------------------------------------------------------
  async function startBooking() {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email so we can send your confirmation.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, eventType }),
      })
      const data = await res.json()
      setDraftId(data.id)
      setStep(1)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function choosePackage(p: Pkg) {
    setPackageId(p.id)
    const size = Math.min(Math.max(partySize, p.minGuests), p.maxGuests)
    setPartySize(size)
    await patchDraft({ packageId: p.id, partySize: size })
    setStep(2)
  }

  const loadSlots = useCallback(
    async (date: string) => {
      if (!packageId) return
      setSlotsLoading(true)
      setStartMinutes(null)
      try {
        const res = await fetch(
          `/api/availability?date=${date}&partySize=${partySize}&packageId=${packageId}`,
        )
        const data = await res.json()
        setSlots(data.slots ?? [])
      } finally {
        setSlotsLoading(false)
      }
    },
    [packageId, partySize],
  )

  async function chooseSlot(s: Slot) {
    setStartMinutes(s.startMinutes)
    await patchDraft({ dateStr, startMinutes: s.startMinutes })
    setStep(3)
  }

  async function goToCheckout() {
    setError(null)
    if (!waiverSigned || !waiverName.trim()) {
      setError('Please review and sign the waiver to continue.')
      return
    }
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }
    setBusy(true)
    try {
      await patchDraft({
        customerName: name,
        customerPhone: phone,
        notes,
        waiverSigned: true,
        waiverSignedName: waiverName,
        waiverGuardian,
      })
      const res = await fetch(`/api/bookings/${draftId}/checkout`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not start checkout.')
        if (data.code === 'CONFLICT') setStep(2)
        return
      }
      await refreshPayment()
      setStep(6)
    } catch {
      setError('Checkout failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Fetch (gift-aware) deposit payment info for the held booking.
  async function refreshPayment() {
    const res = await fetch(`/api/bookings/${draftId}/pay`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setPayment({
        mode: data.payment.mode,
        clientSecret: data.payment.clientSecret,
        depositAmount: data.payment.amount,
      })
    }
  }

  async function applyGift() {
    setGiftError(null)
    if (!giftCode.trim()) return
    const res = await fetch(`/api/bookings/${draftId}/redeem-gift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: giftCode }),
    })
    const data = await res.json()
    if (!res.ok) {
      setGiftError(data.error ?? 'Could not apply gift card.')
      return
    }
    setGiftApplied(data.applied)
    await refreshPayment()
  }

  async function confirmCovered() {
    setBusy(true)
    const res = await fetch(`/api/bookings/${draftId}/confirm-covered`, { method: 'POST' })
    setBusy(false)
    if (res.ok) window.location.href = `/book/confirmation/${draftId}`
    else setError('Could not confirm. Please try again.')
  }

  if (!catalog) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-foreground/60">
        Loading…
      </main>
    )
  }

  const currentEventType = EVENT_TYPES.find((e) => e.key === eventType)

  return (
    <main className="flex-1">
      {/* Header */}
      <header className="bg-brand-dark text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-bold">
            Whitetail Ridge Golf Dome
          </Link>
          <span className="text-sm text-white/70">Need help? Call us 🏌️</span>
        </div>
      </header>

      {/* Progress */}
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <ProgressBar step={step} />
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[1fr_340px]">
        {/* Step content */}
        <div key={step} className="animate-fade-up">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}

          {/* STEP 0 — Start */}
          {step === 0 && (
            <Section title="Let's plan your event 🎉" subtitle="A few quick taps and you're booked.">
              <Label>What are you celebrating?</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => setEventType(e.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                      eventType === e.key
                        ? 'bg-brand text-white ring-brand'
                        : 'bg-white ring-black/10 hover:ring-brand'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              {currentEventType && !currentEventType.instant && (
                <div className="mt-4 rounded-lg bg-brand-light p-4 text-sm text-brand-dark">
                  Big or custom events get a tailored quote and a dedicated planner.{' '}
                  <Link href="/inquire" className="font-semibold underline">
                    Request a quote →
                  </Link>{' '}
                  (we reply fast) — or book a standard package instantly below.
                </div>
              )}

              <div className="mt-6">
                <Label>Roughly how many guests?</Label>
                <Stepper value={partySize} min={1} max={180} onChange={setPartySize} />
              </div>

              <div className="mt-6">
                <Label>Your email (for confirmation &amp; reminders)</Label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-lg border border-black/15 px-4 py-3 outline-none focus:border-brand"
                />
              </div>

              <PrimaryButton onClick={startBooking} disabled={busy}>
                {busy ? 'Starting…' : 'Start planning →'}
              </PrimaryButton>
            </Section>
          )}

          {/* STEP 1 — Package */}
          {step === 1 && (
            <Section title="Pick your party package" subtitle="Most groups choose the Most Popular tier.">
              <div className="grid gap-4 sm:grid-cols-3">
                {catalog.packages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => choosePackage(p)}
                    className={`relative flex flex-col rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                      p.popular ? 'border-accent ring-2 ring-accent' : 'border-black/10'
                    } bg-white`}
                  >
                    {p.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-brand-dark">
                        ⭐ Most Popular
                      </span>
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                      {p.tier}
                    </span>
                    <span className="mt-1 text-xl font-bold text-brand-dark">{p.name}</span>
                    <span className="mt-2 text-2xl font-extrabold">
                      {formatCents(p.pricePerPerson)}
                      <span className="text-sm font-normal text-foreground/60"> /guest</span>
                    </span>
                    <span className="mt-1 text-xs text-foreground/60">
                      {p.durationMinutes / 60} hrs · up to {p.maxGuests} guests
                    </span>
                    <p className="mt-3 text-sm text-foreground/70">{p.description}</p>
                    <ul className="mt-3 space-y-1 text-sm">
                      {p.includes.map((inc) => (
                        <li key={inc} className="flex gap-2">
                          <span className="text-brand">✓</span>
                          <span>{inc}</span>
                        </li>
                      ))}
                    </ul>
                    <span className="mt-4 rounded-full bg-brand px-4 py-2 text-center text-sm font-semibold text-white">
                      Choose {p.name}
                    </span>
                  </button>
                ))}
              </div>
              <BackButton onClick={() => setStep(0)} />
            </Section>
          )}

          {/* STEP 2 — Date & time */}
          {step === 2 && (
            <Section title="Choose your date & time" subtitle={`Online bookings start ${catalog.setting.leadTimeDaysOnline} days out. Earlier? Give us a call.`}>
              <Label>Event date</Label>
              <input
                type="date"
                min={minDate}
                value={dateStr}
                onChange={(e) => {
                  setDateStr(e.target.value)
                  if (e.target.value) loadSlots(e.target.value)
                }}
                className="w-full rounded-lg border border-black/15 px-4 py-3 outline-none focus:border-brand sm:w-auto"
              />

              {dateStr && (
                <div className="mt-6">
                  <Label>Available start times</Label>
                  {slotsLoading ? (
                    <p className="text-sm text-foreground/60">Checking the calendar…</p>
                  ) : slots.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      No openings for {quote?.baysNeeded ?? 1} bay(s) that day. Try another
                      date — weekends fill up fast!
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {slots.map((s) => (
                        <button
                          key={s.startMinutes}
                          onClick={() => chooseSlot(s)}
                          className="rounded-lg border border-black/10 bg-white px-3 py-3 text-sm font-medium transition hover:border-brand hover:bg-brand-light"
                        >
                          {s.label}
                          {s.availableBays <= 3 && (
                            <span className="mt-0.5 block text-xs font-semibold text-accent-dark">
                              Only {s.availableBays} left
                            </span>
                          )}
                          {s.peak && s.availableBays > 3 && (
                            <span className="mt-0.5 block text-xs text-foreground/50">Prime time</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <BackButton onClick={() => setStep(1)} />
            </Section>
          )}

          {/* STEP 3 — F&B */}
          {step === 3 && (
            <Section title="Add food & drink" subtitle="Keep everyone fueled — or decide when you arrive.">
              <div className="space-y-3">
                {catalog.fnb.map((f) => (
                  <SelectableRow
                    key={f.id}
                    selected={fnbPackageId === f.id}
                    onClick={() => {
                      const next = fnbPackageId === f.id ? null : f.id
                      setFnbPackageId(next)
                      patchDraft({ fnbPackageId: next })
                    }}
                    title={f.name}
                    price={`${formatCents(f.price)}${f.pricingType === 'PER_PERSON' ? ' /guest' : ''}`}
                    body={f.description}
                    note={f.dietaryNotes ?? undefined}
                  />
                ))}
                <SelectableRow
                  selected={fnbPackageId === null}
                  onClick={() => {
                    setFnbPackageId(null)
                    patchDraft({ fnbPackageId: null })
                  }}
                  title="We'll decide when we arrive"
                  price="—"
                  body="Lock your bays now and choose food & drinks at the venue."
                />
              </div>
              <div className="mt-6 flex gap-3">
                <BackButton onClick={() => setStep(2)} inline />
                <PrimaryButton onClick={() => setStep(4)}>Continue →</PrimaryButton>
              </div>
            </Section>
          )}

          {/* STEP 4 — Add-ons */}
          {step === 4 && (
            <Section title="Make it unforgettable" subtitle="One-tap extras — add now, adjust later.">
              <div className="space-y-3">
                {catalog.addOns.map((a) => {
                  const qty = addOns[a.id] ?? 0
                  const on = qty > 0
                  const isTime = a.unit === 'PER_30_MIN'
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl border p-4 transition ${
                        on ? 'border-brand bg-brand-light' : 'border-black/10 bg-white'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{a.name}</span>
                          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-foreground/60">
                            {a.category}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/70">{a.description}</p>
                        <p className="mt-1 text-sm font-semibold text-brand-dark">
                          {formatCents(a.price)}
                          {a.unit === 'PER_PERSON' && ' /guest'}
                          {a.unit === 'PER_30_MIN' && ' /30 min'}
                        </p>
                      </div>
                      {isTime ? (
                        <Stepper
                          value={qty}
                          min={0}
                          max={8}
                          small
                          onChange={(v) => setAddOns((s) => ({ ...s, [a.id]: v }))}
                        />
                      ) : (
                        <button
                          onClick={() => setAddOns((s) => ({ ...s, [a.id]: on ? 0 : 1 }))}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            on ? 'bg-brand text-white' : 'bg-black/5 hover:bg-brand hover:text-white'
                          }`}
                        >
                          {on ? '✓ Added' : 'Add'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 flex gap-3">
                <BackButton onClick={() => setStep(3)} inline />
                <PrimaryButton onClick={() => setStep(5)}>Continue →</PrimaryButton>
              </div>
            </Section>
          )}

          {/* STEP 5 — Details + waiver */}
          {step === 5 && (
            <Section title="Your details" subtitle="Almost there — just a few essentials.">
              <Label>Full name</Label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Smith"
                className="w-full rounded-lg border border-black/15 px-4 py-3 outline-none focus:border-brand"
              />
              <div className="mt-4">
                <Label>Phone (for day-of updates)</Label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  className="w-full rounded-lg border border-black/15 px-4 py-3 outline-none focus:border-brand"
                />
              </div>
              <div className="mt-4">
                <Label>Anything we should know? (optional)</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, the birthday star's name, special requests…"
                  rows={3}
                  className="w-full rounded-lg border border-black/15 px-4 py-3 outline-none focus:border-brand"
                />
              </div>

              <div className="mt-6 rounded-xl border border-black/10 bg-white p-4">
                <h3 className="font-semibold text-brand-dark">Liability waiver</h3>
                <div className="mt-2 max-h-32 overflow-y-auto rounded bg-black/[0.03] p-3 text-xs text-foreground/70">
                  By signing, you acknowledge the risks of golf and entertainment
                  activities at Whitetail Ridge Golf Dome and agree to our terms.
                  (Full waiver text to be provided — placeholder for now.)
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waiverSigned}
                    onChange={(e) => setWaiverSigned(e.target.checked)}
                    className="mt-1"
                  />
                  <span>I have read and agree to the waiver.</span>
                </label>
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waiverGuardian}
                    onChange={(e) => setWaiverGuardian(e.target.checked)}
                    className="mt-1"
                  />
                  <span>I am signing as the parent/guardian for guests under 18.</span>
                </label>
                <div className="mt-3">
                  <Label>Type your full name to sign</Label>
                  <input
                    value={waiverName}
                    onChange={(e) => setWaiverName(e.target.value)}
                    placeholder="Your signature"
                    className="w-full rounded-lg border border-black/15 px-4 py-3 italic outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <BackButton onClick={() => setStep(4)} inline />
                <PrimaryButton onClick={goToCheckout} disabled={busy}>
                  {busy ? 'Reserving…' : 'Review & pay deposit →'}
                </PrimaryButton>
              </div>
            </Section>
          )}

          {/* STEP 6 — Pay */}
          {step === 6 && payment && draftId && (
            <Section title="Pay your deposit to lock it in" subtitle={`Just ${quote?.depositPercent ?? 10}% now — the rest is due at your event.`}>
              {/* Gift card redemption */}
              <div className="mb-4 rounded-xl border border-black/10 bg-white p-4">
                <Label>Have a gift card?</Label>
                <div className="flex gap-2">
                  <input
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                    placeholder="GIFT-XXXX-XXXX"
                    className="flex-1 rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand"
                  />
                  <button
                    onClick={applyGift}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
                  >
                    Apply
                  </button>
                </div>
                {giftApplied > 0 && (
                  <p className="mt-2 text-sm font-medium text-green-700">
                    ✓ Gift card applied: −{formatCents(giftApplied)} · Due now: {formatCents(payment.depositAmount)}
                  </p>
                )}
                {giftError && <p className="mt-2 text-sm text-red-600">{giftError}</p>}
              </div>

              {payment.mode === 'covered' ? (
                <button
                  onClick={confirmCovered}
                  disabled={busy}
                  className="w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-brand-dark shadow transition hover:bg-accent-dark hover:text-white disabled:opacity-60"
                >
                  {busy ? 'Confirming…' : '🎉 Confirm booking — your gift card covers the deposit'}
                </button>
              ) : (
                <PaymentStep
                  bookingId={draftId}
                  depositAmount={payment.depositAmount}
                  mode={payment.mode}
                  clientSecret={payment.clientSecret}
                />
              )}
              <p className="mt-4 text-center text-xs text-foreground/50">
                🔒 Secure payment. Cancellation: {catalog.setting.cancelHoursLarge}h notice for
                parties over {catalog.setting.cancelLargeThreshold}, {catalog.setting.cancelHoursSmall}h for smaller.
              </p>
            </Section>
          )}
        </div>

        {/* Order summary sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <OrderSummary
            pkg={selectedPkg}
            partySize={partySize}
            dateStr={dateStr}
            startMinutes={startMinutes}
            quote={quote}
          />
        </aside>
      </div>
    </main>
  )
}

// ---- Presentational helpers ------------------------------------------------
function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1">
          <div
            className={`h-1.5 rounded-full transition ${i <= step ? 'bg-brand' : 'bg-black/10'}`}
          />
          <span
            className={`mt-1 hidden text-xs sm:block ${i === step ? 'font-semibold text-brand' : 'text-foreground/40'}`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-foreground/60">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-foreground/80">{children}</label>
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-brand-dark shadow transition hover:bg-accent-dark hover:text-white disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function BackButton({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${inline ? 'mt-6' : 'mt-6'} rounded-full px-5 py-4 text-sm font-medium text-foreground/60 ring-1 ring-black/10 transition hover:ring-brand`}
    >
      ← Back
    </button>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
  small,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  small?: boolean
}) {
  const sz = small ? 'h-9 w-9' : 'h-12 w-12'
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${sz} rounded-full bg-black/5 text-xl font-bold transition hover:bg-brand hover:text-white`}
      >
        −
      </button>
      <span className={`${small ? 'w-8' : 'w-12'} text-center text-xl font-bold`}>{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${sz} rounded-full bg-black/5 text-xl font-bold transition hover:bg-brand hover:text-white`}
      >
        +
      </button>
    </div>
  )
}

function SelectableRow({
  selected,
  onClick,
  title,
  price,
  body,
  note,
}: {
  selected: boolean
  onClick: () => void
  title: string
  price: string
  body: string
  note?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
        selected ? 'border-brand bg-brand-light' : 'border-black/10 bg-white hover:border-brand'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand bg-brand text-white' : 'border-black/20'
        }`}
      >
        {selected && '✓'}
      </span>
      <span className="flex-1">
        <span className="flex items-center justify-between">
          <span className="font-semibold">{title}</span>
          <span className="font-semibold text-brand-dark">{price}</span>
        </span>
        <span className="block text-sm text-foreground/70">{body}</span>
        {note && <span className="mt-1 block text-xs text-foreground/50">🌱 {note}</span>}
      </span>
    </button>
  )
}

function OrderSummary({
  pkg,
  partySize,
  dateStr,
  startMinutes,
  quote,
}: {
  pkg: Pkg | null
  partySize: number
  dateStr: string
  startMinutes: number | null
  quote: Quote | null
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h3 className="font-bold text-brand-dark">Your event</h3>
      {!pkg ? (
        <p className="mt-2 text-sm text-foreground/50">Pick a package to see your quote.</p>
      ) : (
        <>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Package" v={pkg.name} />
            <Row k="Guests" v={String(partySize)} />
            {dateStr && <Row k="Date" v={dateStr} />}
            {startMinutes !== null && <Row k="Time" v={minutesToLabel(startMinutes)} />}
            {quote && <Row k="Bays" v={String(quote.baysNeeded)} />}
          </dl>

          {quote && (
            <>
              <div className="my-3 border-t border-black/10" />
              <dl className="space-y-1.5 text-sm">
                {quote.lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <dt className="text-foreground/70">
                      {l.label}
                      {l.detail && <span className="block text-xs text-foreground/40">{l.detail}</span>}
                    </dt>
                    <dd className="shrink-0 font-medium">{formatCents(l.amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className="my-3 border-t border-black/10" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCents(quote.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-brand">
                <span>Deposit due now ({quote.depositPercent}%)</span>
                <span className="font-bold">{formatCents(quote.depositAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-foreground/50">
                <span>Balance at event</span>
                <span>{formatCents(quote.balanceDue)}</span>
              </div>
              <p className="mt-3 rounded-lg bg-brand-light p-2 text-center text-xs text-brand-dark">
                That&apos;s about {formatCents(quote.perPersonEffective)} per guest, all-in.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-foreground/60">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}
