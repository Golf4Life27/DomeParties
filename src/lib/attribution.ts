import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// First-touch marketing attribution.
//
// AttributionCapture (client) writes one cookie on the visitor's FIRST landing
// with utm_* / fbclid in the URL; API routes read it here when a lead or booking
// is created. First-touch on purpose: the ad that started the visit gets the
// credit, and a later organic return doesn't overwrite it. The cookie is plain
// JSON, set client-side, and therefore untrusted input — everything read out of
// it is length-capped and the field list is closed.
// ---------------------------------------------------------------------------

export const ATTR_COOKIE = 'wtr_attr'
/** 90 days: a corporate event planned in September can close in November. */
export const ATTR_MAX_AGE = 90 * 24 * 60 * 60

export type Attribution = {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  landingPath: string | null
  fbclid: string | null
  /**
   * Meta's own browser cookies, written by the pixel and read here so server
   * events can carry them too.
   *
   *   _fbp — browser id. Meta flags low fbp coverage on Conversions API events
   *          as a high-priority data-quality problem, because fbp is a main
   *          signal for tying a browser event and a server event to the SAME
   *          person, which is what deduplication and attribution both rely on.
   *   _fbc — click id in Meta's own format. Preferred over rebuilding one from
   *          a stored fbclid: the cookie carries Meta's real click timestamp,
   *          the reconstruction has to invent it.
   */
  fbp: string | null
  fbc: string | null
}

export const EMPTY_ATTRIBUTION: Attribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  landingPath: null,
  fbclid: null,
  fbp: null,
  fbc: null,
}

function cap(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

/**
 * Attribution from the request's cookie, or all-nulls. Never throws: a mangled
 * cookie means an organic-looking record, not a failed lead submission.
 */
export function readAttribution(req: NextRequest): Attribution {
  // Meta's cookies are read whether or not our own attribution cookie exists —
  // a visitor who arrived organically still has an _fbp, and sending it is what
  // lets Meta match their server event to their browser event.
  const meta = {
    fbp: cap(req.cookies.get('_fbp')?.value, 200),
    fbc: cap(req.cookies.get('_fbc')?.value, 500),
  }
  try {
    const raw = req.cookies.get(ATTR_COOKIE)?.value
    if (!raw) return { ...EMPTY_ATTRIBUTION, ...meta }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_ATTRIBUTION, ...meta }
    const o = parsed as Record<string, unknown>
    return {
      utmSource: cap(o.s),
      utmMedium: cap(o.m),
      utmCampaign: cap(o.c),
      utmContent: cap(o.n),
      landingPath: cap(o.lp),
      fbclid: cap(o.f, 500), // Meta click ids run long
      ...meta,
    }
  } catch {
    return { ...EMPTY_ATTRIBUTION, ...meta }
  }
}

/** True when there is anything worth writing to a row. */
export function hasAttribution(a: Attribution): boolean {
  return Object.values(a).some((v) => v !== null)
}
