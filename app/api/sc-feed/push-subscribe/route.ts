import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PB_URL     = process.env.POCKETBASE_URL ?? 'https://mc-db.subliminal.gg'
const COLLECTION = 'sc_feed_push_subscriptions'

async function getPbAdminToken(): Promise<string | null> {
  const email    = process.env.PB_ADMIN_EMAIL
  const password = process.env.PB_ADMIN_PASSWORD
  if (!email || !password) return null
  for (const path of ['/api/admins/auth-with-password', '/api/collections/_superusers/auth-with-password']) {
    try {
      const res = await fetch(`${PB_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password }),
      })
      if (res.ok) return (await res.json()).token as string
    } catch { /* try next */ }
  }
  return null
}

async function ensureCollection(token: string) {
  const check = await fetch(`${PB_URL}/api/collections/${COLLECTION}`, {
    headers: { Authorization: token },
  })
  if (check.ok) return

  await fetch(`${PB_URL}/api/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      name: COLLECTION,
      type: 'base',
      createRule: '',
      listRule: '',
      viewRule: '',
      updateRule: '',
      deleteRule: '',
      schema: [
        { name: 'endpoint', type: 'text', required: true, options: {} },
        { name: 'p256dh',   type: 'text', required: true, options: {} },
        { name: 'auth',     type: 'text', required: true, options: {} },
      ],
    }),
  })
}

async function findSub(endpoint: string) {
  const filter = encodeURIComponent(`endpoint="${endpoint}"`)
  const res    = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records?filter=${filter}&perPage=1`)
  if (!res.ok) return null
  const data = await res.json()
  return data?.items?.[0] ?? null
}

export async function POST(request: Request) {
  try {
    const { endpoint, p256dh, auth } = await request.json() as { endpoint: string; p256dh: string; auth: string }
    if (!endpoint || !p256dh || !auth)
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })

    const token = await getPbAdminToken()
    if (token) await ensureCollection(token)

    const base     = `${PB_URL}/api/collections/${COLLECTION}/records`
    const existing = await findSub(endpoint)
    const payload  = { endpoint, p256dh, auth }

    if (existing) {
      await fetch(`${base}/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json() as { endpoint: string }
    if (!endpoint)
      return NextResponse.json({ error: 'missing endpoint' }, { status: 400 })

    const existing = await findSub(endpoint)
    if (existing) {
      await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${existing.id}`, {
        method: 'DELETE',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
