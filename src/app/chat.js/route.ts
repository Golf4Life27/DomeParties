import { NextRequest } from 'next/server'
import { VENUE } from '@/lib/venue'

// GET /chat.js — the one script tag the main website carries for its chat
// bubble. Which bubble it shows is decided here, on every load, so swapping
// chats never needs the website's host again:
//
// - Dome agent on (DOME_AGENT_WIDGET + DOME_AGENT + a key, same switch as the
//   party site): a small fixed iframe of /embed/chat in the bottom corner. The
//   chat inside tells this script whether it's closed, teasing or open, and the
//   frame is resized to fit, so it never covers the page more than it must.
// - Otherwise: the MyChatBot "Birdie" widget, mounted the way the vendor's own
//   snippet does it, so the website looks as it does today.
//
// Cached for five minutes, so a flip reaches the website within minutes.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const agent =
    process.env.DOME_AGENT_WIDGET === 'on' && process.env.DOME_AGENT === 'on' && Boolean(process.env.ANTHROPIC_API_KEY)
  const account = process.env.NEXT_PUBLIC_MYCHATBOT_ACCOUNT_ID
  const widget = process.env.NEXT_PUBLIC_MYCHATBOT_WIDGET_ID
  const birdie =
    !agent && account && widget
      ? {
          account_id: account,
          widget_id: widget,
          api_url: 'https://api.mychatbot.app',
          assistant_name: 'Birdie',
          color: '#c8ff2e',
          lang: 'en',
          assistant_avatar: `${origin}/birdie-avatar.png`,
          // Without this the vendor shows its own demo business's socials.
          sm_pages: [{ name: 'Facebook', url: VENUE.facebook }],
        }
      : null

  const js = `(function () {
  if (window.__domeChat) return;
  window.__domeChat = true;
  var ORIGIN = ${JSON.stringify(origin)};
  var AGENT = ${JSON.stringify(agent)};
  var BIRDIE = ${JSON.stringify(birdie)};
  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  if (AGENT) {
    var frame = document.createElement('iframe');
    frame.src = ORIGIN + '/embed/chat';
    frame.title = 'Chat with Birdie';
    frame.setAttribute('allowtransparency', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;border:0;margin:0;padding:0;background:transparent;' +
      'color-scheme:normal;z-index:2147483646;width:136px;height:136px;max-width:100%;max-height:100%';
    var state = 'closed';
    function size() {
      var mobile = window.innerWidth <= 480;
      var w, h;
      if (state === 'open') {
        w = mobile ? '100%' : '440px';
        h = mobile ? '100%' : Math.min(640, window.innerHeight) + 'px';
      } else if (state === 'teaser' && !mobile) {
        w = '460px';
        h = '160px';
      } else {
        w = h = mobile ? '112px' : '136px';
      }
      frame.style.width = w;
      frame.style.height = h;
      if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'dome:chat-host', mobile: mobile }, ORIGIN);
    }
    window.addEventListener('message', function (e) {
      if (e.origin !== ORIGIN || e.source !== frame.contentWindow || !e.data || e.data.type !== 'dome:chat') return;
      state = e.data.state;
      size();
    });
    window.addEventListener('resize', size);
    ready(function () { document.body.appendChild(frame); });
    return;
  }

  if (BIRDIE) {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/style.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/widget.js';
    js.async = true;
    js.onload = function () {
      ready(function () {
        var mount = document.createElement('div');
        mount.id = 'my-chat-widget-container';
        document.body.appendChild(mount);
        if (window.MyChatBot) window.MyChatBot.mount('#my-chat-widget-container', BIRDIE);
      });
    };
    document.head.appendChild(js);
  }
})();`

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
