// Quote-request statuses, in the order staff move through them, with the words
// shown on the admin pages. CONTACTED means staff reached out (first touch
// only); REPLIED means the customer wrote back.
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'PROPOSAL_SENT', 'NO_RESPONSE', 'WON', 'LOST'] as const
export type LeadStatusValue = (typeof LEAD_STATUSES)[number]

export const LEAD_LABEL: Record<LeadStatusValue, string> = {
  NEW: 'new',
  CONTACTED: 'reached out',
  REPLIED: 'they replied',
  PROPOSAL_SENT: 'quote sent',
  NO_RESPONSE: 'no reply',
  WON: 'won',
  LOST: 'lost',
}

export const LEAD_BADGE: Record<LeadStatusValue, string> = {
  NEW: 'bg-accent/20 text-accent-dark',
  CONTACTED: 'bg-blue-100 text-blue-800',
  REPLIED: 'bg-indigo-100 text-indigo-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  NO_RESPONSE: 'bg-black/5 text-foreground/60',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-black/5 text-foreground/50',
}

/** Statuses that end a quote request. */
export const CLOSED_LEAD_STATUSES: readonly LeadStatusValue[] = ['WON', 'LOST', 'NO_RESPONSE']

export function leadLabel(s: string): string {
  return LEAD_LABEL[s as LeadStatusValue] ?? s.replace('_', ' ').toLowerCase()
}
