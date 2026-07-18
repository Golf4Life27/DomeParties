// Shared types for the booking engine.

export type AddOnSelection = {
  addOnId: string
  quantity: number
  choices?: string[] // picks for add-ons with a choice menu (e.g. BYO platter apps)
}

export type QuoteInput = {
  partySize: number
  packageId: string
  fnbPackageId?: string | null
  addOns: AddOnSelection[]
  // Optional selected slot — enables peak/off-peak pricing in the quote.
  dateStr?: string | null
  startMinutes?: number | null
}

export type QuoteLine = {
  label: string
  detail?: string
  amount: number // cents
}

export type Quote = {
  baysNeeded: number
  durationMinutes: number
  estimated: boolean // true when bay rate is a "from" estimate (no date/time yet)
  lines: QuoteLine[]
  packageTotal: number
  peakAdjustment: number // +surcharge or -discount on the package portion
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
