import { NextResponse } from 'next/server'
import { pruneOldMessages, requireSecret } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const unauth = requireSecret(request)
  if (unauth) return unauth

  try {
    const count = await pruneOldMessages()
    return NextResponse.json({ ok: true, deleted: count })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
