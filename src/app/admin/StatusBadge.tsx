export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CONFIRMED: 'bg-green-100 text-green-800',
    PENDING: 'bg-amber-100 text-amber-800',
    DRAFT: 'bg-black/5 text-foreground/60',
    CANCELLED: 'bg-red-100 text-red-700',
    COMPLETED: 'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? 'bg-black/5'}`}>
      {status.toLowerCase()}
    </span>
  )
}
