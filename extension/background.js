// SC Feed companion (owner tool — Chrome is the maintained target; Firefox build is frozen)
//
// 1. RSI token sync — reads the HttpOnly `Rsi-Token` cookie from robertsspaceindustries.com
//    and pushes it to SC Feed's owner endpoint when it changes. Used for forum/dev-tracker reads.
// 2. MOTD scrape — RSI made getMotd moderator-only, so the MOTD can only be read from a rendered
//    lobby page. Two paths feed it: the passive content script (content.js, instant when Sub is
//    browsing Spectrum) and an ACTIVE alarm-driven scan that keeps pinned lobby tabs alive and
//    injects the extractor on a timer. The active path exists because the passive one goes silent
//    whenever no lobby is open or Chrome's Memory Saver discards the tab.
// 3. Feed awareness — polls /api/sc-feed, shows the unread count on the toolbar badge, and
//    fires a desktop notification when new items land (even with SC Feed closed).
//
// Cross-browser by construction: Firefox exposes promise-based `browser.*`, Chrome MV3 the same
// on `chrome.*` for the APIs used here (cookies, storage, alarms, scripting, notifications).
const api = globalThis.browser ?? globalThis.chrome

const RSI_URL = 'https://robertsspaceindustries.com'
const COOKIE = 'Rsi-Token'
const DEFAULT_ENDPOINT = 'https://sc-feed.subliminal.gg/api/owner/rsi-token'
const DEFAULT_FEED = 'https://sc-feed.subliminal.gg'
const TOKEN_ALARM = 'rsi-token-resync'
const FEED_ALARM = 'feed-poll'
const MOTD_ALARM = 'motd-scan'
let debounce = null

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getConfig() {
  const c = await api.storage.local.get(['endpoint', 'secret', 'feedUrl', 'notify'])
  return {
    endpoint: c.endpoint || DEFAULT_ENDPOINT,
    secret: c.secret || '',
    feedUrl: (c.feedUrl || DEFAULT_FEED).replace(/\/$/, ''),
    notify: c.notify !== false,
  }
}

// ---------- RSI token sync ----------
// Read the Rsi-Token cookie across every store (Zen/Firefox containers each have their own) and
// push it. There is deliberately NO "is this token logged in?" probe: RSI's identify endpoint
// can't be verified from a non-browser context (it reports anonymous for a perfectly valid
// token), and an earlier probe that hit it on every cookie change rotated Sub's live RSI session
// and logged him out. The backend just stores whatever we send; the token is used only for
// forum/dev-tracker reads now (MOTD comes from the content-script scrape, see below).
let lastScan = { stores: 0, names: [], candidates: 0 }
async function readCookie() {
  let stores = [{ id: undefined }]
  try { const s = await api.cookies.getAllCookieStores(); if (s && s.length) stores = s } catch { /* fall back to default */ }
  const names = new Set()
  const candidates = []
  // Query BOTH ways. A `domain` filter matches on the cookie's stored domain attribute, which
  // differs for host-only (`robertsspaceindustries.com`) vs domain (`.robertsspaceindustries.com`)
  // cookies; a `url` filter instead matches by host+path scope. Chrome and Firefox disagree at
  // those edges, and a domain-only query has been seen returning just the analytics cookies while
  // missing the first-party session ones. Querying both and unioning costs nothing.
  const queries = [{ url: `${RSI_URL}/` }, { domain: 'robertsspaceindustries.com' }]
  for (const st of stores) {
    for (const q of queries) {
      const opts = { ...q }
      if (st.id) opts.storeId = st.id
      let cs = []
      try { cs = await api.cookies.getAll(opts) } catch { /* store unreadable */ }
      for (const c of cs) {
        names.add(c.name)
        if (c.name.toLowerCase() === COOKIE.toLowerCase() && c.value) candidates.push(c.value)
      }
    }
  }
  lastScan = { stores: stores.length, names: [...names], candidates: candidates.length }
  // Prefer the longest candidate — a real session token is never shorter than a stale stub.
  const value = candidates.sort((a, b) => b.length - a.length)[0] || ''
  return { value }
}

async function pushToken(reason) {
  const { value: token } = await readCookie()
  const stamp = at => ({ at, reason })
  if (!token) {
    // Distinguish the three failure modes, because they need completely different fixes and the
    // old catch-all message ("saw: CookieConsent, __stripe_mid…") read like a permissions bug when
    // it usually means this Chrome profile simply isn't signed in to RSI.
    const firstParty = lastScan.names.filter(n => /^(rsi[-_]|_rsi_|cig[-_])/i.test(n))
    const msg = firstParty.length
      ? `signed in, but no ${COOKIE} cookie — saw ${firstParty.join(', ')}`
      : lastScan.names.length
        ? `not signed in to RSI in this browser profile — ${lastScan.names.length} cookies, none first-party (${lastScan.names.slice(0, 5).join(', ')})`
        : `no cookies visible across ${lastScan.stores} store(s) — check this extension's site access for robertsspaceindustries.com`
    await api.storage.local.set({ lastStatus: { ok: false, msg, ...stamp(now()) } })
    return
  }
  const { endpoint, secret } = await getConfig()
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
    await api.storage.local.set({ lastStatus: { ok: res.ok, msg: res.ok ? 'token synced' : `endpoint ${res.status}`, ...stamp(now()) } })
  } catch (e) {
    await api.storage.local.set({ lastStatus: { ok: false, msg: String(e), ...stamp(now()) } })
  }
}

// ---------- MOTD scrape ----------

// Lobby → SC Feed channel. Mirrors LOBBY_CHANNEL in content.js and SPECTRUM_MOTDS on the backend.
const LOBBIES = [
  { lobbyId: '38230',   channelId: 'motd-sc',  url: `${RSI_URL}/spectrum/community/SC/lobby/38230` },
  { lobbyId: '1355241', channelId: 'motd-evo', url: `${RSI_URL}/spectrum/community/SC/lobby/1355241` },
]

// Push a scraped MOTD. This ALWAYS posts, even when the text is unchanged — the server compares
// signatures and decides whether it's a real change or just a liveness ping. Client-side dedupe
// used to live here, and that was the bug: an unchanged MOTD and a dead scraper looked identical
// from the server's side, which is how a dead scraper went unnoticed for a week in 2026-07.
async function ingestMotd({ channelId, body, url }) {
  if (!channelId || !body) return { ok: false, msg: 'empty scrape' }
  const { feedUrl, secret } = await getConfig()
  try {
    const res = await fetch(`${feedUrl}/api/owner/motd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ channelId, body, url }),
    })
    const out = res.ok
      ? { ok: true, changed: !!(await res.json().catch(() => ({}))).isNew }
      : { ok: false, msg: `endpoint ${res.status}` }
    await api.storage.local.set({ lastMotd: { channelId, at: now(), ...out } })
    return out
  } catch (e) {
    const out = { ok: false, msg: String(e) }
    await api.storage.local.set({ lastMotd: { channelId, at: now(), ...out } })
    return out
  }
}

// Injected into the lobby page, so it must be self-contained — no closure over extension scope.
// Mirrors extractMotd() in content.js; keep the two in sync.
function extractMotdInPage() {
  const el = document.querySelector('.lobby-message--motd')
  if (!el) return null
  const wrap = el.querySelector('.lobby-message__wrapper') || el
  const clone = wrap.cloneNode(true)
  clone.querySelector('.lobby-message__header')?.remove()
  clone.querySelector('.lobby-message__dismiss')?.remove()
  const body = (clone.innerText || '').trim()
  if (!body) return null
  const link = wrap.querySelector('a[href]')
  return { body, url: link ? link.href : '' }
}

async function findLobbyTab(lobbyId) {
  let tabs = []
  try { tabs = await api.tabs.query({ url: `${RSI_URL}/spectrum/*` }) } catch { return null }
  const re = new RegExp(`/lobby/${lobbyId}(?:[/?#]|$)`)
  return tabs.find(t => re.test(t.url || '')) || null
}

// Guarantee a scrapeable tab for this lobby: reuse one Sub already has open, revive it if Chrome's
// Memory Saver discarded it (executeScript can't reach a discarded tab), else open our own pinned
// background tab. Never steals focus.
async function ensureLobbyTab(lobby) {
  const existing = await findLobbyTab(lobby.lobbyId)
  if (!existing) {
    try { return await api.tabs.create({ url: lobby.url, pinned: true, active: false }) } catch { return null }
  }
  if (existing.discarded) {
    try { await api.tabs.reload(existing.id) } catch { /* gone between query and reload */ }
  }
  return existing
}

// Spectrum is an SPA and the MOTD banner renders well after load, so poll rather than scrape once.
// Each executeScript call also resets the MV3 service-worker idle timer, keeping us alive.
async function scrapeLobby(lobby, { attempts = 10, delayMs = 2000 } = {}) {
  const tab = await ensureLobbyTab(lobby)
  if (!tab?.id) return null
  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs)
    try {
      const out = await api.scripting.executeScript({ target: { tabId: tab.id }, func: extractMotdInPage })
      const result = out?.[0]?.result
      if (result?.body) return result
    } catch { /* still loading, discarded mid-flight, or navigated away — retry */ }
  }
  return null
}

async function runMotdScan(reason) {
  const results = []
  for (const lobby of LOBBIES) {
    const scraped = await scrapeLobby(lobby)
    results.push(scraped
      ? { channelId: lobby.channelId, ...(await ingestMotd({ channelId: lobby.channelId, ...scraped })) }
      : { channelId: lobby.channelId, ok: false, msg: 'MOTD not rendered' })
  }
  await api.storage.local.set({ lastMotdScan: { at: now(), reason, results } })
  return results
}

// ---------- "Send to SC Feed" (right-click → save) ----------

const SAVE_MENU_ID = 'scfeed-save'

// Fires on link, page, and selection contexts. Recreate (removeAll first) on install/startup
// so re-installs don't throw "duplicate id".
function setupContextMenus() {
  if (!api.contextMenus) return
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: SAVE_MENU_ID,
      title: 'Send to SC Feed',
      contexts: ['page', 'link', 'selection'],
    })
  })
}

async function saveToFeed(info, tab) {
  const { feedUrl, secret, notify } = await getConfig()
  // Link context → save the link target; otherwise the page. Title prefers a text selection,
  // then the page title, falling back to the URL (the backend also defaults title→url).
  const url = info.linkUrl || info.pageUrl || tab?.url || ''
  let title = (info.selectionText || tab?.title || '').trim().slice(0, 300)
  if (!url) return
  if (!title) title = url
  try {
    const res = await fetch(`${feedUrl}/api/sc-feed/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ url, title }),
    })
    await api.storage.local.set({ lastSave: { ok: res.ok, msg: res.ok ? 'saved' : `endpoint ${res.status}`, at: now(), title } })
    if (notify) api.notifications?.create?.(`scfeed-save-${Date.now()}`, {
      type: 'basic',
      iconUrl: `${feedUrl}/icons/icon-512.png`,
      title: res.ok ? 'Saved to SC Feed' : `Save failed (${res.status})`,
      message: title,
    })
  } catch (e) {
    await api.storage.local.set({ lastSave: { ok: false, msg: String(e), at: now(), title } })
    if (notify) api.notifications?.create?.(`scfeed-save-${Date.now()}`, {
      type: 'basic', iconUrl: `${feedUrl}/icons/icon-512.png`, title: 'Save failed', message: String(e),
    })
  }
}

api.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SAVE_MENU_ID) saveToFeed(info, tab)
})

// ---------- feed awareness (badge + notifications + popup data) ----------

function now() { return new Date().toISOString() }

async function pollFeed(reason) {
  const { feedUrl, notify } = await getConfig()
  let channels
  try {
    const res = await fetch(`${feedUrl}/api/sc-feed`, { cache: 'no-store' })
    if (!res.ok) return
    channels = await res.json()
  } catch { return }

  // Flatten every channel's messages, newest first.
  const items = []
  for (const ch of channels || []) {
    for (const m of ch.messages || []) {
      items.push({ title: m.title || '(untitled)', source: m.source || ch.label || '', url: m.url || '', ts: m.ts_raw || m.timestamp || '' })
    }
  }
  items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  const latest = items.slice(0, 20)

  const store = await api.storage.local.get(['lastSeenTs'])
  // First run: seed lastSeenTs to newest so we don't notify the whole backlog.
  const lastSeenTs = store.lastSeenTs || latest[0]?.ts || now()
  const unread = items.filter(i => i.ts && i.ts > lastSeenTs)

  await api.storage.local.set({ latestItems: latest, lastSeenTs, feedCheckedAt: now() })
  await setBadge(unread.length)

  if (notify && unread.length > 0 && reason !== 'seed') {
    const top = unread[0]
    api.notifications?.create?.(`scfeed-${Date.now()}`, {
      type: 'basic',
      iconUrl: `${feedUrl}/icons/icon-512.png`,
      title: unread.length === 1 ? top.source || 'SC Feed' : `SC Feed — ${unread.length} new`,
      message: top.title,
    })
  }
}

async function setBadge(count) {
  const text = count > 99 ? '99+' : count > 0 ? String(count) : ''
  try {
    await api.action.setBadgeText({ text })
    await api.action.setBadgeBackgroundColor?.({ color: '#ffb231' })
  } catch { /* badge unsupported */ }
}

// Clear the unread badge by advancing the seen marker to now (popup open / "open feed").
async function markSeen() {
  await api.storage.local.set({ lastSeenTs: now() })
  await setBadge(0)
}

// ---------- listeners ----------

api.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (cookie.name !== COOKIE || removed) return
  if (!/(^|\.)robertsspaceindustries\.com$/.test(cookie.domain)) return
  clearTimeout(debounce)
  debounce = setTimeout(() => pushToken('cookie-changed'), 1500)
})

api.alarms.create(TOKEN_ALARM, { periodInMinutes: 360 })
api.alarms.create(FEED_ALARM, { periodInMinutes: 5 })
api.alarms.create(MOTD_ALARM, { periodInMinutes: 15 })
api.alarms.onAlarm.addListener(a => {
  if (a.name === TOKEN_ALARM) pushToken('alarm')
  if (a.name === FEED_ALARM) pollFeed('alarm')
  if (a.name === MOTD_ALARM) runMotdScan('alarm')
})

api.notifications?.onClicked?.addListener(async () => {
  const { feedUrl } = await getConfig()
  api.tabs.create({ url: feedUrl })
})

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'push-now') { pushToken('manual').then(() => sendResponse({ done: true })); return true }
  if (msg?.type === 'poll-now') { pollFeed('manual').then(() => sendResponse({ done: true })); return true }
  if (msg?.type === 'mark-seen') { markSeen().then(() => sendResponse({ done: true })); return true }
  if (msg?.type === 'motd') { ingestMotd(msg).then(() => sendResponse({ done: true })); return true }
  if (msg?.type === 'scan-motd-now') { runMotdScan('manual').then(r => sendResponse({ done: true, results: r })); return true }
})

// Prime on install/startup so the badge + popup have data immediately, (re)create the right-click
// "Send to SC Feed" menu, and get the lobby tabs up so the first MOTD scan has something to read.
api.runtime.onInstalled?.addListener?.(() => { pollFeed('seed'); setupContextMenus(); runMotdScan('installed') })
api.runtime.onStartup?.addListener?.(() => { pollFeed('seed'); setupContextMenus(); runMotdScan('startup') })
