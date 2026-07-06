import { prisma } from '@/lib/db'
import BayToggle from './BayToggle'

export const dynamic = 'force-dynamic'

export default async function BaysAdmin() {
  const resources = await prisma.resource.findMany({ orderBy: { sortOrder: 'asc' } })
  const exclusiveCount = resources.filter((r) => r.exclusive && r.active).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Bays & inventory</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        Mark a bay <strong>Exclusive</strong> if only this booking engine controls it (safe to
        confirm instantly). Leave it <strong>Shared</strong> if it also lives in Trackman — those
        bookings are held for a quick staff review so you never double-book.
      </p>
      <div className="mt-3 inline-block rounded-lg bg-brand-light px-4 py-2 text-sm text-brand-dark">
        <strong>{exclusiveCount}</strong> bays are exclusive (instant-bookable). The rest require review.
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase text-foreground/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Floor</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Allocation</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {resources.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-foreground/60">{r.type.toLowerCase().replace('_', ' ')}</td>
                <td className="px-4 py-3 text-foreground/60">{r.floor ?? '—'}</td>
                <td className="px-4 py-3 text-foreground/60">{r.capacity}</td>
                <td className="px-4 py-3">
                  <BayToggle id={r.id} field="exclusive" value={r.exclusive} onLabel="Exclusive" offLabel="Shared" />
                </td>
                <td className="px-4 py-3">
                  <BayToggle id={r.id} field="active" value={r.active} onLabel="Active" offLabel="Inactive" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
