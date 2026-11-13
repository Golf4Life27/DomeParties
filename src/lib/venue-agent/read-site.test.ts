import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cfDecode, htmlToText, linksIn, normaliseUrl, SiteError, tooThinToDraft, bookingHostsIn, pdfLinksIn, rankedPdfLinksIn } from './read-site'

test('website addresses: plain names work, anything not a public site is refused', () => {
  assert.equal(normaliseUrl('example.com').toString(), 'https://example.com/')
  assert.equal(normaliseUrl('http://example.com/parties#top').toString(), 'http://example.com/parties')
  for (const bad of ['ftp://example.com', 'http://127.0.0.1', 'http://10.0.0.5/admin', 'localhost', 'http://user:pw@example.com', 'http://example.com:8080', 'not a url at all']) {
    assert.throws(() => normaliseUrl(bad), SiteError, bad)
  }
})

test('pages become plain text, without scripts or styles', () => {
  const t = htmlToText('<style>p{}</style><h1>Parties</h1><p>Kids &amp; adults</p><script>alert(1)</script><p>From $20</p>')
  assert.equal(t, 'Parties\nKids & adults\nFrom $20')
})

test('links are kept with their text, resolved against the page', () => {
  const links = linksIn('<a href="/birthday-parties">Birthday <b>Parties</b></a><a href="https://book.example.net/x">Book</a>', new URL('https://venue.example.com/'))
  assert.deepEqual(
    links.map((l) => [l.url.toString(), l.text]),
    [
      ['https://venue.example.com/birthday-parties', 'Birthday Parties'],
      ['https://book.example.net/x', 'Book'],
    ],
  )
})

test('reads email addresses that Cloudflare hides on the page', () => {
  const email = 'events@example.com'
  const key = 0x5a
  const hex = key.toString(16) + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('')
  assert.equal(cfDecode(hex), email)
  const html = `<p>Email <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</a> today</p>`
  assert.match(htmlToText(html), /Email events@example\.com today/)
  assert.equal(cfDecode('zz'), null)
})

test('a site that only draws its pages in the browser is too thin to draft from', () => {
  const shell = htmlToText('<html><head><title>Smash - Home</title><script>window.__STATE__={}</script></head><body><div id="app"></div></body></html>')
  assert.equal(tooThinToDraft([{ text: shell }]), true)
  const real = 'Birthday parties: 90 minutes in a private room, pizza and soda, $199.99 for up to 10 guests. Extra guests $15 each. Open Monday to Friday 12pm to 8pm, weekends 10am to 8pm. A $50 deposit holds your date and comes off the balance on the day. Book three to four weeks ahead. Grip socks are included for every jumper and are theirs to keep.'
  assert.equal(tooThinToDraft([{ text: real }]), false)
})

test('a booking tool embedded or linked from another site is noted, so a no-price draft asks the owner to paste', () => {
  const base = new URL('https://funpark.example/birthdays/')
  const html = `
    <iframe src="https://fsp-widgets.web.app/embed/party"></iframe>
    <iframe src="/our-own-map"></iframe>
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>
    <iframe src="https://www.youtube.com/embed/abc"></iframe>
    <a href="https://funpark.bookingzone.com/rc/plans">Book a party</a>
    <a href="https://www.facebook.com/funpark">Facebook</a>`
  assert.deepEqual(bookingHostsIn(html, base).sort(), ['fsp-widgets.web.app', 'funpark.bookingzone.com'])
  assert.deepEqual(bookingHostsIn('<a href="/parties">Parties</a>', base), [])
})

test('party and price PDFs are picked up, even on the site builder\'s file host; other PDFs are not', () => {
  const html = `
    <a href="/files/2026-Birthday-Party-Packages.pdf">Download</a>
    <a href="https://irp.cdn-website.com/abc/files/uploaded/menu.pdf">Party Menu</a>
    <a href="/files/waiver.pdf">Waiver</a>
    <a href="/files/employment-application.pdf">Apply</a>
    <a href="/parties">Parties</a>`
  const got = pdfLinksIn(html, new URL('https://funpark.example.com/')).map((u) => u.toString())
  assert.deepEqual(got, ['https://funpark.example.com/files/2026-Birthday-Party-Packages.pdf', 'https://irp.cdn-website.com/abc/files/uploaded/menu.pdf'])
})

test('the party packages PDF is ranked ahead of menus and event-space sheets', () => {
  const html = `
    <a href="/wp-content/uploads/Holiday-Menu-2026.pdf">Holiday Menu</a>
    <a href="/wp-content/uploads/Event-Spaces.pdf">Event Spaces</a>
    <a href="/wp-content/uploads/2026/03/Pricing-Packages.pdf">Pricing Packages</a>
    <a href="/wp-content/uploads/Birthday-Waiver.pdf">Birthday waiver</a>`
  const got = rankedPdfLinksIn(html, new URL('https://golf.example.com/')).map((r) => [r.url.pathname.split('/').pop(), r.score])
  assert.deepEqual(got[0], ['Pricing-Packages.pdf', 8])
  assert.deepEqual(got[1][0], 'Event-Spaces.pdf')
  assert.ok((got.find((g) => g[0] === 'Holiday-Menu-2026.pdf')?.[1] as number) < 0)
  assert.ok((got.find((g) => g[0] === 'Birthday-Waiver.pdf')?.[1] as number) < 0)
})
