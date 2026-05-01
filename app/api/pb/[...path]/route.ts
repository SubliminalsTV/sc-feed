import { type NextRequest, NextResponse } from 'next/server'

const PB_URL = process.env.POCKETBASE_URL ?? 'http://pocketbase:8090'

async function proxy(req: NextRequest, params: { path: string[] }) {
  const { path } = await params
  const target = `${PB_URL}/${path.join('/')}`
  const url = new URL(target)

  // Forward query string
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const headers = new Headers()
  req.headers.forEach((v, k) => {
    if (!['host', 'connection'].includes(k)) headers.set(k, v)
  })

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    // @ts-expect-error - duplex required for streaming body
    duplex: 'half',
  })

  const resHeaders = new Headers()
  res.headers.forEach((v, k) => {
    if (!['transfer-encoding', 'connection'].includes(k)) resHeaders.set(k, v)
  })

  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params)
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params)
}
