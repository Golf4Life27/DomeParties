import dns from 'node:dns/promises'
import net from 'node:net'

// Reads a venue's public website so its setup can be drafted for it. Only
// public http(s) pages, a handful of them, small and quick, and nothing on a
// private or internal address: this runs on our server, so it must never be
// pointed at anything but the open web.

const MAX_BYTES = 1_500_000
const MAX_PAGES = 6
const KEYWORDS = /part(y|ies)|birthday|event|group|corporate|package|pric|rate|hour|menu|food|book|reserv|faq|league|lane|bay|simulator|team/i

export class SiteError extends Error {}

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

async function fetchPage(start: URL): Promise<{ url: URL; html: string } | null> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': 'VenueSetupReader/1.0 (+drafts a booking chat setup from a public website)', accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      url = normaliseUrl(new URL(loc, url).toString())
      continue
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

export type SitePages = { home: URL; pages: { url: string; text: string }[]; links: { url: string; text: string }[] }

/** The home page plus the few pages most likely to hold hours, parties and prices. */
export async function readVenueSite(input: string): Promise<SitePages> {
  const home = normaliseUrl(input)
  const first = await fetchPage(home)
  if (!first) throw new SiteError(`Couldn't open ${home.hostname}. Check the address, or try the page that lists your parties.`)
  const pages = [{ url: first.url.toString(), text: htmlToText(first.html).slice(0, 20000) }]
  const allLinks = linksIn(first.html, first.url)
  const seen = new Set([first.url.toString()])
  const candidates = allLinks
    .filter((l) => l.url.hostname.replace(/^www\./, '') === first.url.hostname.replace(/^www\./, ''))
    .filter((l) => KEYWORDS.test(l.text) || KEYWORDS.test(l.url.pathname))
    .filter((l) => !/\.(pdf|jpe?g|png|gif|zip)$/i.test(l.url.pathname))
  for (const c of candidates) {
    if (pages.length >= MAX_PAGES) break
    const key = c.url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const page = await fetchPage(c.url).catch(() => null)
    if (page) pages.push({ url: page.url.toString(), text: htmlToText(page.html).slice(0, 12000) })
  }
  // Booking links often point to another site (a booking system), so keep those too.
  const links = allLinks
    .filter((l) => KEYWORDS.test(l.text) || KEYWORDS.test(l.url.toString()))
    .slice(0, 60)
    .map((l) => ({ url: l.url.toString(), text: l.text }))
  return { home: first.url, pages, links }
}
