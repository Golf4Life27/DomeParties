import { NextRequest, NextResponse } from 'next/server'
import { verifyLeadAction } from '@/lib/sign'
import { closerAllSet, closerSaidYes } from '@/lib/closer'

// The two buttons in the follow-up closer's first email: "yes, still planning"
// and "someone already reached out". Public path, authenticated by an expiring
// HMAC signature that covers the action.
//
// GET only shows a page with a button; acting is a POST. Mail scanners open every
// link in a message before a person does, and a GET that acted would stop the
// follow-up (or send the price) on its own. Same reasoning as /api/staff/approve.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { action, exp, sig, ok } = params(req, id)
  if (!ok) return page(400, 'This link has expired', 'Just reply to our email and we’ll take it from there.')

  const post = `/api/leads/${encodeURIComponent(id)}/closer?a=${action}&exp=${exp}&sig=${encodeURIComponent(sig)}`
  const [title, label] =
    action === 'yes'
      ? ['Still planning your party?', 'Yes, send me the price']
      : ['Already talked with our team?', 'Yes, stop the follow-ups']
  return page(
    200,
    title,
    `<form method="post" action="${esc(post)}" style="margin-top:24px">
       <button type="submit" style="background:#c8ff2e;color:#0e1740;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:700;cursor:pointer">
         ${label}
       </button>
     </form>`,
  )
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { action, ok } = params(req, id)
  if (!ok) return page(400, 'This link has expired', 'Just reply to our email and we’ll take it from there.')

  try {
    if (action === 'allset') {
      await closerAllSet(id)
      return page(200, 'Got it, thanks!', 'We won’t send any more follow-ups. See you at the dome.')
    }
    await closerSaidYes(id)
    return page(
      200,
      'Great, it’s on its way',
      'Your price and booking link are in your inbox. You can also <a href="/book" style="color:#c8ff2e">book here</a> any time.',
    )
  } catch (e) {
    console.error('closer action failed', id, e)
    return page(500, 'Something went wrong', 'Just reply to our email and we’ll take it from there.')
  }
}

function params(req: NextRequest, id: string) {
  const a = req.nextUrl.searchParams.get('a')
  const action = a === 'allset' ? 'allset' : 'yes'
  const exp = parseInt(req.nextUrl.searchParams.get('exp') ?? '0', 10)
  const sig = req.nextUrl.searchParams.get('sig') ?? ''
  return { action, exp, sig, ok: (a === 'yes' || a === 'allset') && verifyLeadAction(id, action, exp, sig) }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function page(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,Arial,sans-serif;background:#0a102e;color:#e9edfb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:420px;padding:32px;text-align:center">
<div style="font-size:56px">🏌️</div>
<h1 style="color:${status === 200 ? '#c8ff2e' : '#fbbf24'}">${title}</h1>
<p style="line-height:1.6">${body}</p>
</div></body>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  )
}
