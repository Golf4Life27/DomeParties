import dns from 'node:dns/promises'
import net from 'node:net'

// Reads a venue's public website so its setup can be drafted for it. Only
// public http(s) pages, a handful of them, small and quick, and nothing on a
// private or internal address: this runs on our server, so it must never be
// pointed at anything but the open web.

const MAX_BYTES = 1_500_000
const MAX_PAGES = 6
/** Off after the Nov 11 test (1 of 3): a 3.1 MB packages PDF was over the size cap, menus were read
 *  ahead of the packages PDF, and two PDFs pushed one setup to 115 seconds. Owners can still upload a PDF. */
const READ_PDFS = false
const MAX_PDFS = 2
/** Same cap as an owner's upload: base64 adds a third, and the model request has a size limit. */
const MAX_PDF_BYTES = 3 * 1024 * 1024
/** A PDF worth reading names parties, groups or prices in its file name or link text. */
const PDF_KEYWORDS = /part(y|ies)|birthday|event|group|corporate|package|pric|rate|menu|food|field ?trip|camp|outing/i
const KEYWORDS = /part(y|ies)|birthday|event|group|corporate|package|pric|rate|hour|menu|food|book|reserv|faq|league|lane|bay|simulator|team/i

export class SiteError extends Error {}

export const READER_USER_AGENT = 'VenueSetupReader/1.0 (+drafts a booking chat setup from a public website)'

function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7))
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

export function normaliseUrl(input: string): URL {
  const raw = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SiteError("That doesn't look like a website address.")
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SiteError('Only http and https websites can be read.')
  if (url.username || url.password) throw new SiteError('Website addresses with a login in them are not read.')
  if (url.port && !['80', '443'].includes(url.port)) throw new SiteError('Only standard website ports are read.')
  if (!url.hostname.includes('.') || net.isIP(url.hostname)) throw new SiteError('Use the venue’s website name, not a number address.')
  url.hash = ''
  return url
}

async function assertPublic(url: URL) {
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => [])
  if (addrs.length === 0) throw new SiteError(`Couldn't find ${url.hostname}.`)
  if (addrs.some((a) => privateAddress(a.address))) throw new SiteError('That address is not a public website.')
}

const bare = (h: string) => h.toLowerCase().replace(/^www\./, '')
/** Same website: example.com, www.example.com and book.example.com all count. */
export function sameSite(a: string, b: string): boolean {
  const x = bare(a)
  const y = bare(b)
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)
}

/** The first page a guest-facing address leads to. Strict about where it ends
 *  up: a venue address that now redirects to a different website (an expired
 *  domain, a closed venue) is refused rather than drafted from someone else's
 *  site, and a security wall is named as one so the owner can paste instead. */
async function fetchFirstPage(start: URL): Promise<{ url: URL; html: string } | null> {
  return fetchPage(start, true)
}

async function fetchPage(start: URL, strict = false): Promise<{ url: URL; html: string } | null> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': READER_USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      const next = normaliseUrl(new URL(loc, url).toString())
      if (strict && !sameSite(next.hostname, start.hostname)) {
        throw new SiteError(
          `${start.hostname} now leads to a different website (${next.hostname}). If your venue has a new address, use that, or paste your party page instead.`,
        )
      }
      url = next
      continue
    }
    if (strict && [401, 403, 429, 503].includes(res.status)) {
      throw new SiteError(`${start.hostname}'s security settings won't let us read it. Paste your party page or upload a PDF of it instead.`)
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    await reader.cancel().catch(() => {})
    return { url, html: new TextDecoder().decode(Buffer.concat(chunks)) }
  }
  return null
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

// Many venue sites sit behind Cloudflare, which hides email addresses on the
// page as a hex string ("[email protected]" in plain text). The encoding is a
// one-byte XOR, so the address can be read back the way the browser does.
export function cfDecode(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(out) ? out : null
}

function unhideEmails(html: string): string {
  return html
    .replace(/<(a|span)\b[^>]*data-cfemail=["']([0-9a-f]+)["'][^>]*>[\s\S]*?<\/\1>/gi, (m, _t, hex) => cfDecode(hex) ?? m)
    .replace(/href=["'][^"']*\/cdn-cgi\/l\/email-protection#([0-9a-f]+)["']/gi, (m, hex) => {
      const e = cfDecode(hex)
      return e ? `href="mailto:${e}"` : m
    })
}

export function htmlToText(html: string): string {
  return decode(
    unhideEmails(html)
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\r]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function linksIn(html: string, base: URL): { url: URL; text: string }[] {
  const out: { url: URL; text: string }[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decode(m[1]), base)
      url.hash = ''
      out.push({ url, text: htmlToText(m[2]).slice(0, 80) })
    } catch {
      /* not a link we can follow */
    }
  }
  return out
}

/** Fewer than about 300 readable characters across every page read: not enough to draft from. */
export function tooThinToDraft(pages: { text: string }[]): boolean {
  return pages.reduce((n, p) => n + p.text.replace(/\s+/g, ' ').trim().length, 0) < 300
}

export type SitePages = {
  home: URL
  pages: { url: string; text: string }[]
  links: { url: string; text: string }[]
  /** Other sites whose booking tools the pages embed or link to, where prices may live out of the reader's sight. */
  bookingHosts: string[]
  /** Party or price-list PDFs the venue links to from its own pages, read along with the pages. */
  pdfs: { url: string; base64: string }[]
}

/** Booking and ticketing tools venues commonly embed or link to for parties and groups. */
const BOOKING_HOST = /(^|\.)(roller\.app|rollerdigital\.com|bookingzone\.com|bookeo\.com|fareharbor\.com|resova\.(us|com|io)|xola\.com|checkfront\.com|peek\.com|clubspeed\.com|centeredgeonline\.com|centeredge\.io|partywirks\.com|bookthatapp\.com|setmore\.com|square\.site|acuityscheduling\.com|zenoti\.com|tixr\.com|eventbrite\.com|web\.app)$/i

/** Iframes nearly every site carries (tracking, maps, video, social) that never hold party prices. */
const NOT_BOOKING = /(^|\.)(googletagmanager\.com|google\.com|doubleclick\.net|youtube\.com|youtube-nocookie\.com|vimeo\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|spotify\.com|hotjar\.com|googleapis\.com|recaptcha\.net|gstatic\.com)$/i

/** Hosts of off-site iframes and of links to known booking tools. */
export function bookingHostsIn(html: string, base: URL): string[] {
  const hosts = new Set<string>()
  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(decode(m[1]), base)
      if (bare(u.hostname) !== bare(base.hostname) && !NOT_BOOKING.test(u.hostname)) hosts.add(u.hostname)
    } catch {
      /* not a usable address */
    }
  }
  for (const l of linksIn(html, base)) if (BOOKING_HOST.test(l.url.hostname)) hosts.add(l.url.hostname)
  return [...hosts].slice(0, 10)
}

/** The home page plus the few pages most likely to hold hours, parties and prices. */
/** The party or price-list PDFs a page links to, by file name or link text. A venue often keeps its
 *  packages in a PDF on its site builder's file host, so the host can differ from the site's own. */
export function pdfLinksIn(html: string, base: URL): URL[] {
  const out: URL[] = []
  for (const l of linksIn(html, base)) {
    if (!/\.pdf$/i.test(l.url.pathname)) continue
    if (!PDF_KEYWORDS.test(l.text) && !PDF_KEYWORDS.test(decodeURIComponent(l.url.pathname))) continue
    if (!out.some((u) => u.toString() === l.url.toString())) out.push(l.url)
  }
  return out
}

async function fetchPdf(start: URL): Promise<{ url: string; base64: string } | null> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': READER_USER_AGENT, accept: 'application/pdf' }, signal: AbortSignal.timeout(8000) })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      url = normaliseUrl(new URL(loc, url).toString())
      continue
    }
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_PDF_BYTES) return null
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_PDF_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    const buf = Buffer.concat(chunks)
    // Only a real PDF, whatever the server calls it.
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null
    return { url: url.toString(), base64: buf.toString('base64') }
  }
  return null
}

export async function readVenueSite(input: string): Promise<SitePages> {
  const home = normaliseUrl(input)
  const tryPage = (u: URL) =>
    fetchFirstPage(u).catch((e: unknown) => {
      if (e instanceof SiteError) throw e
      return null // timed out or the connection dropped
    })
  // An old or mistyped page on a working site (a 404, a timeout) falls back to
  // the site's home page rather than failing the whole setup.
  let first = await tryPage(home)
  if (!first && home.pathname !== '/') first = await tryPage(new URL('/', home))
  if (!first) throw new SiteError(`Couldn't open ${home.hostname}. Check the address, or paste your party page instead.`)
  const pages = [{ url: first.url.toString(), text: htmlToText(first.html).slice(0, 20000) }]
  const allLinks = linksIn(first.html, first.url)
  const bookingHosts = new Set(bookingHostsIn(first.html, first.url))
  const pdfLinks = pdfLinksIn(first.html, first.url)
  const seen = new Set([first.url.toString()])
  const candidates = allLinks
    .filter((l) => bare(l.url.hostname) === bare(first.url.hostname))
    .filter((l) => KEYWORDS.test(l.text) || KEYWORDS.test(l.url.pathname))
    .filter((l) => !/\.(pdf|jpe?g|png|gif|zip)$/i.test(l.url.pathname))
  for (const c of candidates) {
    if (pages.length >= MAX_PAGES) break
    const key = c.url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const page = await fetchPage(c.url).catch(() => null)
    if (page) {
      pages.push({ url: page.url.toString(), text: htmlToText(page.html).slice(0, 12000) })
      for (const h of bookingHostsIn(page.html, page.url)) bookingHosts.add(h)
      for (const u of pdfLinksIn(page.html, page.url)) if (!pdfLinks.some((x) => x.toString() === u.toString())) pdfLinks.push(u)
    }
  }
  const pdfs: { url: string; base64: string }[] = []
  for (const u of READ_PDFS ? pdfLinks.slice(0, MAX_PDFS * 2) : []) {
    if (pdfs.length >= MAX_PDFS) break
    const pdf = await fetchPdf(u).catch(() => null)
    if (pdf) pdfs.push(pdf)
  }
  // Some site builders (Square Online, for one) send an empty shell and draw
  // the page in the browser, so the reader sees little more than the venue's
  // name. A demo drafted from that would only say "contact the venue", so ask
  // the owner to paste the page instead, as for a site that blocks the reader.
  if (pdfs.length === 0 && tooThinToDraft(pages)) {
    throw new SiteError(
      `${home.hostname} draws its pages in the browser, so our reader could see almost nothing on it. Paste your party page or upload a PDF of it instead.`,
    )
  }
  // Booking links often point to another site (a booking system), so keep those too.
  const links = allLinks
    .filter((l) => KEYWORDS.test(l.text) || KEYWORDS.test(l.url.toString()))
    .slice(0, 60)
    .map((l) => ({ url: l.url.toString(), text: l.text }))
  return { home: first.url, pages, links, bookingHosts: [...bookingHosts], pdfs }
}
