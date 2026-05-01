'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { FeedChannel } from '@/app/api/sc-feed/route'

const POLL_INTERVAL_MS = 2 * 60 * 1000

interface AlertItem {
  id: string
  channelLabel: string
  channelId: string
  title: string
  url?: string
}

function playChime() {
  try {
    const audio = new Audio('/sounds/notification.mp3')
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {
    // Audio may be blocked until user interaction
  }
}

export function FeedAlerts() {
  const lastSeenRef = useRef<Map<string, string>>(new Map())
  const isInitRef = useRef(false)
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/sc-feed')
      if (!res.ok) return
      const channels: FeedChannel[] = await res.json()

      if (!isInitRef.current) {
        for (const ch of channels) {
          if (ch.messages.length > 0) {
            lastSeenRef.current.set(ch.id, ch.messages[0].ts_raw ?? '')
          }
        }
        isInitRef.current = true
        return
      }

      const newAlerts: AlertItem[] = []
      for (const ch of channels) {
        if (!ch.messages.length || ch.error) continue
        const latest = ch.messages[0]
        const lastTs = lastSeenRef.current.get(ch.id) ?? ''
        if (latest.ts_raw && latest.ts_raw > lastTs) {
          newAlerts.push({
            id:           `${ch.id}-${latest.ts_raw}`,
            channelLabel: ch.label,
            channelId:    ch.id,
            title:        latest.title,
            url:          latest.url || undefined,
          })
          lastSeenRef.current.set(ch.id, latest.ts_raw)
        }
      }

      if (newAlerts.length > 0) {
        playChime()
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 5))
      }
    } catch {
      // silently ignore poll errors
    }
  }, [])

  useEffect(() => {
    // Skip initial poll if the tab is hidden (e.g. Zen Browser background workspace).
    // If we init while hidden, lastSeenRef fills with current timestamps and toasts
    // never fire once the user actually views the tab. Defer init to first visible event.
    if (document.visibilityState === 'visible') poll()

    const handleVisibility = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', handleVisibility)
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [poll])

  function dismiss(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  if (alerts.length === 0) return null

  return (
    <div className="fixed right-5 bottom-20 z-40 flex flex-col gap-2 w-72 pointer-events-none">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className="glass-card rounded-xl p-3 border border-primary-container/30 shadow-xl pointer-events-auto"
          style={{ animation: 'mc-slide-in 0.3s ease-out' }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bell className="w-3 h-3 text-primary-container shrink-0" />
              <span className="text-[9px] font-label font-black uppercase tracking-widest text-primary-container truncate">
                {alert.channelLabel}
              </span>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {alert.url ? (
            <a
              href={alert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1 text-xs font-headline font-bold text-on-surface line-clamp-2 hover:text-primary-container transition-colors"
            >
              {alert.title}
              <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />
            </a>
          ) : (
            <Link
              href="/"
              onClick={() => dismiss(alert.id)}
              className="text-xs font-headline font-bold text-on-surface line-clamp-2 hover:text-primary-container transition-colors"
            >
              {alert.title}
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
