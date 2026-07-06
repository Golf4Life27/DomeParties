// All money is stored and computed in integer cents to avoid float errors.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

/** Format integer cents as USD, e.g. 12500 -> "$125.00" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

/** Apply an integer percent (e.g. 20) to a cents amount, rounded. */
export function applyPercent(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100)
}
