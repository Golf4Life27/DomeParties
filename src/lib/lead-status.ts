// Lead statuses in the order staff move through them, with the words the
// dashboard shows. Contacted is split in two so a lead Billy reached but never
// heard back from ("no reply") can be found and worked again, apart from one
// that's actually talking with us ("replied"). No prisma import, so client
// components can use it.
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'NO_RESPONSE', 'PROPOSAL_SENT', 'WON', 'LOST'] as const

export type LeadStatusValue = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABEL: Record<LeadStatusValue, string> = {
  NEW: 'new',
  CONTACTED: 'contacted, customer replied',
  NO_RESPONSE: 'contacted, no reply',
  PROPOSAL_SENT: 'proposal sent',
  WON: 'won',
  LOST: 'lost',
}

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_LABEL[status as LeadStatusValue] ?? status.replace('_', ' ').toLowerCase()
}
