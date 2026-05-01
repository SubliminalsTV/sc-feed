import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const getText = (s: string, tag: string) =>
  s.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
   ?.[1]?.trim() ?? ''

export async function GET() {
  try {
    const res = await fetch('https://status.robertsspaceindustries.com/index.xml', {
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()

    const items: { id: string; title: string; url: string; body: string; ts_raw: string; source: string; timestamp: string }[] = []
    const itemRe = /<item>([\s\S]*?)<\/item>/g
    let m: RegExpExecArray | null

    while ((m = itemRe.exec(xml)) !== null && items.length < 5) {
      const s       = m[1]
      const title   = getText(s, 'title')
      if (!title) continue
      const link    = getText(s, 'link')
      const pubDate = getText(s, 'pubDate')
      const desc    = getText(s, 'description')
      const ts      = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
      const body    = desc
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim()

      items.push({ id: `rsi-history-${items.length}`, title, url: link, body, ts_raw: ts, source: 'RSI Status', timestamp: ts })
    }

    return NextResponse.json(items)
  } catch {
    return NextResponse.json([])
  }
}
