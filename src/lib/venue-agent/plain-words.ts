// The owner reads the "we couldn't find these" list. The setup reader sometimes names the setup's own
// fields in it ("otherLinks", "unit.count"), which means nothing to an owner (seen Nov 25 on Wisconsin
// Indoor Golf). Every field name is turned into plain words before the list leaves the server.

const FIELDS: Record<string, string> = {
  otherlinks: 'other booking links',
  partyurl: 'party booking page',
  guestsperunit: 'guests per bay or lane',
  hoursunclear: 'unclear hours',
  hourslisted: 'opening hours',
  notstated: 'not stated',
  pricelisted: 'listed price',
  peakamount: 'peak price',
  pricefrom: 'starting price',
  amountto: 'top of the price range',
  maxguests: 'most guests',
  minguests: 'fewest guests',
  durationminutes: 'length',
  webhookurl: 'team alert link',
  howitworks: 'how booking works',
  taxpercent: 'tax rate',
  servicecharge: 'service charge',
  service_charge: 'service charge',
  timezone: 'time zone',
  allday: 'all day',
  per_unit_hour: 'hourly',
  per_person: 'per person',
  flat: 'flat fee',
  'unit.count': 'number of bays or lanes',
  'handoff.email': 'email for guest requests',
  tiers: 'group price tiers',
  addons: 'add-ons',
  faq: 'common questions',
}

const split = (w: string) => w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()

function plainField(token: string): string {
  const key = token.toLowerCase()
  if (FIELDS[key]) return FIELDS[key]
  const parts = token.split('.')
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase()
    if (FIELDS[last]) return FIELDS[last]
    return parts.map((p) => FIELDS[p.toLowerCase()] ?? split(p)).join(' ')
  }
  return split(token)
}

// A dotted path (unit.count, booking.partyUrl), a camelCase word (otherLinks) or a snake_case word
// (per_unit_hour). Ordinary words, prices ("$12.50") and web addresses are left alone.
const FIELD = /`?\b(?:[a-z][A-Za-z0-9]*\.)+[a-z][A-Za-z0-9_]*\b`?|`?\b[a-z]+(?:[A-Z][a-z0-9]*)+\b`?|`?\b[a-z]+(?:_[a-z]+)+\b`?/g

export function plainLine(line: string): string {
  const urls: string[] = []
  const kept = line.replace(/https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|co|uk|au|ie|de|ca|us|io|app|golf|fun)\b\S*/gi, (u) => `\u0000${urls.push(u) - 1}\u0000`)
  const plain = kept
    .replace(FIELD, (m) => plainField(m.replace(/`/g, '')))
    .replace(/`/g, '')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => urls[Number(i)])
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

export const plainLines = (lines: string[]) => lines.map(plainLine)

/** True when a line still holds something that reads like a setup field name. */
export function hasFieldName(line: string): boolean {
  const kept = line.replace(/https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|co|uk|au|ie|de|ca|us|io|app|golf|fun)\b\S*/gi, '')
  return new RegExp(FIELD.source).test(kept)
}
