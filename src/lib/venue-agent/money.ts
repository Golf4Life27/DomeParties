// Money is kept in the currency's smallest unit (cents, pence, yen) so totals
// never drift, and written out the way the venue's own locale writes it.

export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** fractionDigits(currency))
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 10 ** fractionDigits(currency))
}

/** Percent of an amount, rounded to the smallest unit. */
export function percentOf(minor: number, percent: number): number {
  return Math.round((minor * percent) / 100)
}
