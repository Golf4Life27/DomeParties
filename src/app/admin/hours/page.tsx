import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'
import { hoursContext, describeWindow, isUncontested } from '@/lib/hours'
import { todayStr, addDays, formatDateLong } from '@/lib/time'
import ReseedHoursButton from './ReseedHoursButton'

export const dynamic = 'force-dynamic'

const DAY_OPTIONS = [
  { value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const FIELDS: FieldDef[] = [
  { key: 'label', label: 'Season label (e.g. Off-season, In-season)' },
  { key: 'kind', label: 'Kind', type: 'select', options: [
    { value: 'GOLF', label: 'GOLF — Trackman sells bays (contention window)' },
    { value: 'PARTY', label: 'PARTY — when we host events' },
  ] },
  { key: 'dayOfWeek', label: 'Day', type: 'select', options: DAY_OPTIONS },
  { key: 'closed', label: 'Closed this day', type: 'bool' },
  { key: 'openMinute', label: 'Opens (minutes from midnight — 660 = 11am)', type: 'int' },
  { key: 'closeMinute', label: 'Closes (minutes — 1260 = 9pm)', type: 'int' },
  { key: 'validFrom', label: 'Season starts (YYYY-MM-DD, blank = always)', type: 'date' },
  { key: 'validTo', label: 'Season ends (YYYY-MM-DD, blank = always)', type: 'date' },
  { key: 'sortOrder', label: 'Sort order', type: 'int' },
  { key: 'active', label: 'Active', type: 'bool' },
]

const BLANK = {
  label: 'Off-season', kind: 'PARTY', dayOfWeek: 6, closed: false,
  openMinute: 660, closeMinute: 1260, validFrom: '', validTo: '', sortOrder: 0, active: true,
}

export default async function HoursAdmin() {
  const rows = await prisma.operatingHours.findMany({ orderBy: [{ sortOrder: 'asc' }, { dayOfWeek: 'asc' }] })
  const serialized = rows.map((r) => ({
    ...r,
    dayOfWeek: String(r.dayOfWeek),
    validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : '',
    validTo: r.validTo ? r.validTo.toISOString().slice(0, 10) : '',
  }))

  // Next 10 days resolved, so the effect of these rules is visible at a glance.
  const preview: { dateStr: string; golf: string; party: string; safe: boolean }[] = []
  for (let i = 0; i < 10; i++) {
    const d = addDays(todayStr(), i)
    const ctx = await hoursContext(d)
    preview.push({
      dateStr: d,
      golf: describeWindow(ctx.golf),
      party: describeWindow(ctx.party),
      safe: ctx.party ? isUncontested(ctx, ctx.party.openMinute, ctx.party.closeMinute) : false,
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Hours</h1>
      <p className="mt-1 max-w-3xl text-foreground/60">
        <strong>GOLF</strong> hours are when Trackman is selling bays — that&apos;s the only window where a
        party could collide with a bay rental. <strong>PARTY</strong> hours are when we&apos;ll host events, and
        can be wider. A party that falls entirely outside golf hours is <strong>uncontested</strong>: it confirms
        instantly on any bay, with no Trackman check needed.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-brand-dark">Next 10 days, as the booking engine sees them</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-foreground/50">
              <th className="py-1 pr-4">Date</th><th className="pr-4">Golf (contended)</th>
              <th className="pr-4">Parties sellable</th><th>Conflict risk</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((p) => (
              <tr key={p.dateStr} className="border-t border-black/5">
                <td className="py-1.5 pr-4">{formatDateLong(p.dateStr)}</td>
                <td className="pr-4">{p.golf}</td>
                <td className="pr-4">{p.party}</td>
                <td>
                  {p.party === 'Closed' ? (
                    <span className="text-foreground/40">—</span>
                  ) : p.safe ? (
                    <span className="font-semibold text-green-700">None — instant confirm</span>
                  ) : (
                    <span className="font-medium text-amber-700">Overlaps golf — check needed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-brand-dark">Rules</h2>
        <ReseedHoursButton />
      </div>
      <CatalogEditor endpoint="/api/admin/hours" fields={FIELDS} items={serialized} blank={BLANK} noun="hours rule" />
    </div>
  )
}
