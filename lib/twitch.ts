// Shared Twitch Helix client used by /api/sc-feed and /api/sc-feed/twitch-proxy.
// Holds the app token and the per-login dedup cache in module scope.

const CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? ''
const STREAM_TTL_MS = 60 * 1000
const TOKEN_BUFFER_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 6000

export type StreamState = {
  live: boolean
  streamId?: string
  title?: string
  gameName?: string
  viewerCount?: number
  startedAt?: string
  thumbnailUrl?: string
  userName?: string
  fetchedAt: number
}

const streamCache = new Map<string, StreamState>()
let appToken: { token: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt - TOKEN_BUFFER_MS > Date.now()) return appToken.token
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Twitch credentials not configured')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    })
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) throw new Error(`Twitch token HTTP ${res.status}`)
    const data: { access_token: string; expires_in: number } = await res.json()
    appToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
    return appToken.token
  } finally {
    clearTimeout(timer)
  }
}

async function fetchStreamsFromHelix(logins: string[], retried = false): Promise<Record<string, StreamState>> {
  const token = await getAppToken()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const url = new URL('https://api.twitch.tv/helix/streams')
    for (const l of logins) url.searchParams.append('user_login', l)
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${token}` },
    })
    if (res.status === 401 && !retried) {
      appToken = null
      return fetchStreamsFromHelix(logins, true)
    }
    if (!res.ok) throw new Error(`Twitch Helix HTTP ${res.status}`)

    const data: { data: Array<{
      id: string; user_login: string; user_name: string; game_name: string;
      title: string; viewer_count: number; started_at: string; thumbnail_url: string;
    }> } = await res.json()

    const now = Date.now()
    const result: Record<string, StreamState> = {}
    for (const login of logins) result[login.toLowerCase()] = { live: false, fetchedAt: now }
    for (const s of data.data ?? []) {
      result[s.user_login.toLowerCase()] = {
        live: true,
        streamId: s.id,
        title: s.title,
        gameName: s.game_name,
        viewerCount: s.viewer_count,
        startedAt: s.started_at,
        thumbnailUrl: s.thumbnail_url.replace('{width}', '440').replace('{height}', '248'),
        userName: s.user_name,
        fetchedAt: now,
      }
    }
    return result
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch live streams for a set of logins, using a 60s per-login dedup cache. */
export async function getStreamStates(logins: string[]): Promise<Record<string, StreamState>> {
  const lower = logins.map(l => l.toLowerCase())
  const now = Date.now()
  const fresh: Record<string, StreamState> = {}
  const stale: string[] = []

  for (const login of lower) {
    const cached = streamCache.get(login)
    if (cached && now - cached.fetchedAt < STREAM_TTL_MS) fresh[login] = cached
    else stale.push(login)
  }

  if (stale.length > 0) {
    const fetched = await fetchStreamsFromHelix(stale)
    for (const [login, state] of Object.entries(fetched)) {
      streamCache.set(login, state)
      fresh[login] = state
    }
  }

  return fresh
}

export function isTwitchConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET)
}
