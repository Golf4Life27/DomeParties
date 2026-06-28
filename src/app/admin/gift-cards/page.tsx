import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'

export const dynamic = 'force-dynamic'

const BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  REDEEMED: 'bg-blue-100 text-blue-800',
  VOID: 'bg-black/5 text-foreground/50',
}

export default async function GiftCardsAdmin() {
  const [cards, agg] = await Promise.all([
    prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.giftCard.aggregate({
      where: { status: { in: ['ACTIVE', 'REDEEMED'] } },
      _sum: { initialAmount: true, balance: true },
    }),
  ])
  const sold = agg._sum.initialAmount ?? 0
  const outstanding = agg._sum.balance ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Gift cards</h1>
      <p className="mt-1 text-foreground/60">Cash up front; outstanding balance is a future liability.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm">
          <div className="text-xs text-white/80">Sold (paid)</div>
          <div className="mt-1 text-2xl font-extrabold">{formatCents(sold)}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="text-xs text-foreground/50">Outstanding balance</div>
          <div className="mt-1 text-2xl font-extrabold">{formatCents(outstanding)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase text-foreground/50">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {cards.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground/50">No gift cards yet.</td></tr>
            )}
            {cards.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3 font-mono text-xs">{g.code}</td>
                <td className="px-4 py-3">{formatCents(g.initialAmount)}</td>
                <td className="px-4 py-3 font-medium">{formatCents(g.balance)}</td>
                <td className="px-4 py-3">{g.recipientName ?? g.recipientEmail ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${BADGE[g.status] ?? 'bg-black/5'}`}>
                    {g.status.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground/50">{g.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
