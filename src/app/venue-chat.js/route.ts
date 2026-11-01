import { NextRequest } from 'next/server'
import { getVenue } from '@/venues'
import { venueProductOn } from '@/lib/venue-agent/gate'

// GET /venue-chat.js?venue=<slug> — the one line a venue pastes into its
// website:
//   <script src="https://<this site>/venue-chat.js?venue=<slug>" async></script>
// It adds the chat bubble in the corner. Everything about the chat is decided
// here on each load, so the venue never edits its website again. Off, or for a
// venue that isn't set up, it does nothing at all.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('venue') ?? ''
  const on = venueProductOn() && getVenue(slug) !== null
  const js = on
    ? `(function () {
  if (window.__venueChat) return;
  window.__venueChat = true;
  var ORIGIN = ${JSON.stringify(req.nextUrl.origin)};
  var frame = document.createElement('iframe');
  frame.src = ORIGIN + '/embed/venue/' + ${JSON.stringify(encodeURIComponent(slug))};
  frame.title = 'Chat';
  frame.setAttribute('allowtransparency', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;border:0;background:transparent;z-index:2147483646;width:96px;height:96px;max-width:100%;max-height:100%';
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || e.source !== frame.contentWindow || !e.data || e.data.type !== 'venue:chat') return;
    var open = e.data.state === 'open';
    frame.style.width = open ? '428px' : '96px';
    frame.style.height = open ? Math.min(628, window.innerHeight) + 'px' : '96px';
  });
  function add() { document.body.appendChild(frame); }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();`
    : '/* chat not set up */'
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
}
