import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RSI_TOKEN = process.env.RSI_TOKEN ?? ''

export async function GET() {
  if (!RSI_TOKEN) {
    return NextResponse.json({ valid: false, reason: 'RSI_TOKEN not configured' })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)

    // Minimal Spectrum API call — fetch a single announcement thread list
    const res = await fetch('https://robertsspaceindustries.com/api/spectrum/forum/channel/threads', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':       'https://robertsspaceindustries.com/spectrum/',
        'Origin':        'https://robertsspaceindustries.com',
        'X-Rsi-Token':  RSI_TOKEN,
        'Cookie':        `Rsi-Token=${RSI_TOKEN}`,
      },
      body: JSON.stringify({ channel_id: '1', sort: 'newest', page: 1 }),
    }).finally(() => clearTimeout(timer))

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ valid: false, reason: `HTTP ${res.status}` })
    }

    const data = await res.json().catch(() => null)
    if (!data?.success) {
      return NextResponse.json({ valid: false, reason: data?.msg ?? 'API returned success=false' })
    }

    return NextResponse.json({ valid: true })
  } catch (err) {
    return NextResponse.json({ valid: false, reason: String(err) })
  }
}
