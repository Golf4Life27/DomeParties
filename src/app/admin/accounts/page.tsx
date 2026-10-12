import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { monthName } from '@/lib/accounts'
import AccountForm from './AccountForm'
import AccountRowActions from './AccountRowActions'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  FUNDRAISER: 'Fundraiser',
  CORPORATE: 'Corporate',
  CHAMBER: 'Chamber',
  BOOSTER: 'School / booster',
  MILESTONE: 'Milestone birthday',
  OTHER: 'Other',
}

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    where: { active: true },
    orderBy: [{ nextOutreachOn: 'asc' }, { contactName: 'asc' }],
  })
  const now = new Date()
  const due = accounts.filter((a) => a.nextOutreachOn && a.nextOutreachOn <= now)
  const annualValue = accounts.reduce((s, a) => s + (a.lastEventValue ?? 0), 0)

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Annual accounts</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        Groups that come back every year — fundraisers, chamber events, repeat corporate parties.
        These get bought by a seat that rotates, so the reminder fires about ten weeks before their
        month to catch whoever holds it now.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Stat label="Accounts" value={String(accounts.length)} />
        <Stat label="Last year's combined value" value={annualValue > 0 ? formatCents(annualValue) : '—'} />
        <Stat label="Due to contact now" value={String(due.length)} tone={due.length > 0 ? 'warn' : undefined} />
      </div>

      {due.length > 0 && (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>{due.length === 1 ? 'One account is' : `${due.length} accounts are`} due for outreach.</strong>{' '}
          {due.map((a) => a.organization ?? a.contactName).join(', ')}. Their event month is coming up — reach out
          before the new chair starts calling other venues.
        </div>
      )}

      <div className="mt-6">
        <AccountForm />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase text-foreground/50">
            <tr>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Last event</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Contact next</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-foreground/50">
                  Nothing here yet. Add the groups you already know come back every year — Casa, the
                  Chamber, any corporate party that has booked twice.
                </td>
              </tr>
            )}
            {accounts.map((a) => {
              const isDue = !!a.nextOutreachOn && a.nextOutreachOn <= now
              return (
                <tr key={a.id} className={isDue ? 'bg-amber-50/60' : 'hover:bg-brand-light/40'}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-brand-dark">{a.organization ?? a.contactName}</span>
                    <span className="block text-xs text-foreground/55">
                      {a.organization ? a.contactName : 'Personal'}
                      {a.contactRole ? ` · ${a.contactRole}` : ''}
                      {a.timesBooked > 1 ? ` · booked ${a.timesBooked}×` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{KIND_LABEL[a.kind] ?? a.kind}</td>
                  <td className="px-4 py-3 text-foreground/70">{monthName(a.typicalMonth) ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-foreground/60">
                    {a.lastEventOn ? a.lastEventOn.toISOString().slice(0, 10) : '—'}
                    {a.lastHeadcount ? <span className="block">{a.lastHeadcount} guests</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {a.lastEventValue ? formatCents(a.lastEventValue) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.nextOutreachOn ? (
                      <span className={isDue ? 'font-semibold text-amber-800' : 'text-foreground/60'}>
                        {isDue ? 'Now' : a.nextOutreachOn.toISOString().slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-foreground/40">Set a month</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AccountRowActions
                      account={{
                        id: a.id,
                        contactName: a.contactName,
                        organization: a.organization,
                        contactRole: a.contactRole,
                        email: a.email,
                        phone: a.phone,
                        kind: a.kind,
                        typicalMonth: a.typicalMonth,
                        lastEventOn: a.lastEventOn ? a.lastEventOn.toISOString().slice(0, 10) : null,
                        lastEventValue: a.lastEventValue,
                        lastHeadcount: a.lastHeadcount,
                        timesBooked: a.timesBooked,
                        relationshipOwner: a.relationshipOwner,
                        notes: a.notes,
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 ring-1 ${
        tone === 'warn' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-black/5'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-brand-dark">{value}</div>
    </div>
  )
}
