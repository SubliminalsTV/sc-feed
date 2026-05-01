import { NextResponse } from 'next/server'
import { fetchRsiStatusRss, requireSecret } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const unauth = requireSecret(request)
  if (unauth) return unauth

  // No push for RSI status — informational, not news
  try {
    const count = await fetchRsiStatusRss()
    return NextResponse.json({ ok: true, channel: 'rsi-status', count })
  } catch (err) {
    return NextResponse.json({ ok: false, channel: 'rsi-status', error: String(err) }, { status: 500 })
  }
}
