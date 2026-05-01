import { NextResponse } from 'next/server'
import type { FeedMessage } from '@/app/api/sc-feed/route'
import { getStreamStates, isTwitchConfigured, type StreamState } from '@/lib/twitch'

export const dynamic = 'force-dynamic'

function buildLiveMessage(login: string, state: StreamState): FeedMessage {
  const display = state.userName ?? login
  const url = `https://www.twitch.tv/${login}`
  const ts = state.startedAt ?? new Date(state.fetchedAt).toISOString()
  return {
    id: `twitch-live-${login}-${state.streamId ?? state.fetchedAt}`,
    title: state.title ?? `${display} is live`,
    body: state.gameName ? `${state.gameName} · ${state.viewerCount?.toLocaleString() ?? 0} viewers` : undefined,
    url,
    source: display,
    timestamp: ts,
    ts_raw: ts,
    image: state.thumbnailUrl,
    tag: 'LIVE',
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const loginsParam = searchParams.get('logins') ?? ''
  const logins = loginsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (logins.length === 0) return NextResponse.json({ messages: [], states: {} })
  if (logins.length > 50) return NextResponse.json({ error: 'Too many logins' }, { status: 400 })

  if (!isTwitchConfigured()) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 })
  }

  try {
    const fresh = await getStreamStates(logins)
    const states: Record<string, { live: boolean; userName?: string }> = {}
    const messages: FeedMessage[] = []
    for (const login of logins) {
      const state = fresh[login]
      states[login] = { live: state?.live ?? false, userName: state?.userName }
      if (state?.live) messages.push(buildLiveMessage(login, state))
    }
    messages.sort((a, b) => (b.ts_raw ?? '').localeCompare(a.ts_raw ?? ''))
    return NextResponse.json({ messages, states })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
