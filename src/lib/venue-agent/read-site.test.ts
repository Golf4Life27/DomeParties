import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, linksIn, normaliseUrl, SiteError } from './read-site'

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
