import { NextRequest } from 'next/server'

// GET /embed.js — a tiny loader the marketing site drops in. It injects an
// auto-resizing iframe of the booking flow (chrome hidden).
export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const js = `(function () {
  var ORIGIN = ${JSON.stringify(origin)};
  var current = document.currentScript;
  var mount = document.getElementById('whitetail-dome-booking') || (current && current.parentNode) || document.body;
  var iframe = document.createElement('iframe');
  iframe.src = ORIGIN + '/book?embed=1';
  iframe.title = 'Book your event at Whitetail Ridge Golf Dome';
  iframe.loading = 'lazy';
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.minHeight = '620px';
  iframe.style.display = 'block';
  mount.appendChild(iframe);
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.type !== 'dome:height') return;
    if (e.data.height) iframe.style.height = e.data.height + 'px';
  });
})();`
  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
