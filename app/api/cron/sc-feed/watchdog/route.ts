import { NextResponse } from 'next/server'
import { requireSecret, stampCronHeartbeat } from '../_shared'
import { sql } from '@/lib/db'
import { getConfigStatus, getConfigValue, setConfigValue } from '@/lib/sc-config'

// Extension-liveness watchdog. The SC Feed browser extension is the SOLE source of both the RSI
// token push AND the MOTD scrape, and it can silently die (self-uninstall, disabled, browser
// closed) — which is exactly what froze the MOTD for a week in 2026-07 with nothing flagging it.
//
// The extension re-pushes the token every 6h on a timer (background.js TOKEN_ALARM), so
// `rsi_token.updated` is a reliable liveness heartbeat independent of whether the MOTD content
// changed. This endpoint (fired by the VPS host crontab, same as the other cron routes) checks
// that heartbeat + MOTD freshness and fires a Discord webhook when either goes stale — a PUSH
// alert, because the failure mode is precisely "nobody was looking at the dashboard".
//
// De-duped via a `watchdog_state` config row: one alert on the transition to stale, a reminder
// every WATCHDOG_RENOTIFY_HOURS while it stays stale, and a recovery ping when it clears.

export const dynamic = 'force-dynamic'

const H = 3600_000
const TOKEN_STALE_MS = (Number(process.env.WATCHDOG_TOKEN_STALE_HOURS) || 12) * H
const MOTD_STALE_MS  = (Number(process.env.WATCHDOG_MOTD_STALE_HOURS)  || 72) * H
const RENOTIFY_MS    = (Number(process.env.WATCHDOG_RENOTIFY_HOURS)    || 24) * H

const MOTD_CHANNELS = ['motd-sc', 'motd-evo'] as const
const MOTD_LABEL: Record<string, string> = { 'motd-sc': 'SC MOTD', 'motd-evo': 'Evo MOTD' }

type WatchdogState = { alerting: boolean; since: string; lastNotified: string }
const EMPTY_STATE: WatchdogState = { alerting: false, since: '', lastNotified: '' }

function ago(ms: number | null): string {
  if (ms == null) return 'never'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

async function sendDiscord(embed: Record<string, unknown>): Promise<{ sent: boolean; reason: string }> {
  const url = process.env.WATCHDOG_DISCORD_WEBHOOK
  if (!url) return { sent: false, reason: 'no webhook configured' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'SC Feed Watchdog', embeds: [embed] }),
    })
    return { sent: res.ok, reason: res.ok ? '' : `discord ${res.status}` }
  } catch (e) {
    return { sent: false, reason: String(e) }
  }
}

export async function GET(request: Request) {
  const unauth = requireSecret(request)
  if (unauth) return unauth

  try {
    const now = Date.now()

    // 1. Extension liveness — the token is re-pushed every 6h, so a stale `updated` = dead extension.
    const tok = await getConfigStatus('rsi_token')
    const tokenAgeMs = tok.updated ? now - new Date(tok.updated).getTime() : null
    const tokenStale = tokenAgeMs == null || tokenAgeMs > TOKEN_STALE_MS

    // 2. MOTD freshness — newest row per MOTD channel. Softer signal (can be genuinely quiet).
    const rows = await sql`
      select channel_id, max(ts_raw) as last_ts
      from scfeed.sc_feed_messages
      where channel_id in ('motd-sc', 'motd-evo')
      group by channel_id
    `
    const motdAge: Record<string, number | null> = { 'motd-sc': null, 'motd-evo': null }
    for (const r of rows) {
      const ts = r.last_ts ? new Date(r.last_ts as string).getTime() : null
      motdAge[r.channel_id as string] = ts == null ? null : now - ts
    }
    const motdStale = MOTD_CHANNELS.some((c) => motdAge[c] == null || (motdAge[c] as number) > MOTD_STALE_MS)

    const stale = tokenStale || motdStale
    const reasons: string[] = []
    if (tokenStale) reasons.push(`extension heartbeat stale — token last pushed ${ago(tokenAgeMs)}`)
    if (motdStale) reasons.push('MOTD not refreshed within threshold')

    // De-dup state.
    let state = EMPTY_STATE
    try { const raw = await getConfigValue('watchdog_state'); if (raw) state = { ...EMPTY_STATE, ...JSON.parse(raw) } } catch { /* keep empty */ }

    const fields = [
      { name: 'Token push', value: ago(tokenAgeMs), inline: true },
      ...MOTD_CHANNELS.map((c) => ({ name: MOTD_LABEL[c], value: ago(motdAge[c]), inline: true })),
    ]

    let action = 'none'
    let delivery: { sent: boolean; reason: string } | null = null

    if (stale) {
      const firstTime = !state.alerting
      const dueAgain = !!state.lastNotified && now - new Date(state.lastNotified).getTime() > RENOTIFY_MS
      if (firstTime || dueAgain) {
        delivery = await sendDiscord({
          title: '⚠️ SC Feed: extension appears down',
          description: `${reasons.join('\n')}\n\n**Fix:** reinstall the SC Feed extension in Zen and open a testing-chat lobby (38230 / 1355241).`,
          color: 0xffb231,
          fields,
          footer: { text: 'SC Feed watchdog · sc-feed.subliminal.gg/owner' },
        })
        action = firstTime ? 'alerted' : 're-alerted'
        state = {
          alerting: true,
          since: firstTime ? new Date(now).toISOString() : state.since,
          lastNotified: new Date(now).toISOString(),
        }
        await setConfigValue('watchdog_state', JSON.stringify(state), { updated_via: 'watchdog' })
      } else {
        action = 'suppressed'
      }
    } else if (state.alerting) {
      delivery = await sendDiscord({
        title: '✅ SC Feed: extension recovered',
        description: 'Token push + MOTD are fresh again.',
        color: 0x51cf66,
        fields,
        footer: { text: 'SC Feed watchdog' },
      })
      action = 'recovered'
      state = { alerting: false, since: '', lastNotified: new Date(now).toISOString() }
      await setConfigValue('watchdog_state', JSON.stringify(state), { updated_via: 'watchdog' })
    }

    const summary = {
      ok: true, stale, action,
      tokenAgeMs, motdAge,
      ...(delivery ? { delivered: delivery.sent, deliveryNote: delivery.reason } : {}),
    }
    await stampCronHeartbeat('watchdog', summary)
    return NextResponse.json(summary)
  } catch (err) {
    await stampCronHeartbeat('watchdog', { ok: false, error: String(err) })
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
