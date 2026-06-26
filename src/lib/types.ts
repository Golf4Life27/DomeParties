// Shared types for the booking engine.

export type AddOnSelection = {
  addOnId: string
  quantity: number
}

export type QuoteInput = {
  partySize: number
  packageId: string
  fnbPackageId?: string | null
  addOns: AddOnSelection[]
}

export type QuoteLine = {
  label: string
  detail?: string
  amount: number // cents
}

export type Quote = {
  baysNeeded: number
  durationMinutes: number
  lines: QuoteLine[]
  packageTotal: number
  fnbTotal: number
  addOnsTotal: number
  serviceCharge: number
  serviceChargePct: number
  taxAmount: number
  taxPct: number
  total: number
  depositAmount: number
  depositPercent: number
  balanceDue: number
  perPersonEffective: number // total / partySize, for "value" framing
}

export type TimeSlot = {
  startMinutes: number
  endMinutes: number
  label: string // e.g. "10:00 AM"
  availableBays: number
  peak: boolean
}
