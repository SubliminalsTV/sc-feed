'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, Check, CheckCheck, ChevronDown, ChevronUp,
  Clock, ExternalLink, RotateCcw, X,
} from 'lucide-react'
import type { FeedChannel, FeedMessage } from '@/app/api/sc-feed/route'
import {
  MOTD_CHANNEL_IDS, NOTIF_COLORS, NOTIF_READ_KEY, PILL,
  useFeedPrefs, type NotifItem,
} from './sc-feed-types'
import { getRsiStatusTheme, timeAgo } from './sc-feed-utils'

export function RsiStatusCard({ rsiStatus }: {
  rsiStatus: NonNullable<FeedChannel['rsiStatus']>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const theme = getRsiStatusTheme(rsiStatus.summaryStatus)

  return (
    <a
      href="https://status.robertsspaceindustries.com/"
      target="_blank"
      rel="noopener noreferrer"
      className={`block shrink-0 border-b ${theme.sectionBg} hover:brightness-110 transition-[filter]`}
    >
      <div className="flex items-center justify-between px-4 py-2 select-none">
        <div className="flex items-center gap-2">
          <span className={`${PILL} ${theme.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.dot}`} />
            {theme.label}
          </span>
          <span className="text-[10px] font-mono text-on-surface-variant/30">
            {rsiStatus.systems.length} systems
          </span>
        </div>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setCollapsed(c => !c) }}
          className={`p-1 rounded ${theme.chevron} transition-colors`}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-1.5">
          {rsiStatus.systems.map(sys => {
            const sTheme = getRsiStatusTheme(sys.status)
            return (
              <div key={sys.name} className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-label font-black text-on-surface/70 truncate">
                  {sys.name}
                </span>
                <span className={`${PILL} ${sTheme.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sTheme.dot}`} />
                  {sTheme.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </a>
  )
}

function NotifCard({ item, isRead, onToggle }: {
  item: NotifItem
  isRead: boolean
  onToggle: () => void
}) {
  const { dateFormat } = useFeedPrefs()
  const color = NOTIF_COLORS[item.channelId] ?? 'bg-surface-container text-on-surface-variant border-outline-variant/40'

  return (
    <div className={`relative glass-card rounded-xl p-3 transition-all duration-300 ${isRead ? 'opacity-40 hover:opacity-100' : ''}`}>
      <button
        onClick={onToggle}
        title={isRead ? 'Mark unread' : 'Mark as read'}
        className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center border transition-all duration-200 ${isRead
            ? 'border-primary-container/60 text-primary-container'
            : 'border-outline-variant/30 text-transparent hover:border-primary-container/50 hover:text-primary-container/50'
          }`}
      >
        <Check className="w-2.5 h-2.5" />
      </button>

      {/* Title — 1 line */}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link flex items-start gap-1 text-xs font-headline font-bold text-on-surface hover:text-primary-container transition-colors leading-snug pr-7"
        >
          <span className="line-clamp-1">{item.title}</span>
          <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-30 group-hover/link:opacity-100 transition-opacity" />
        </a>
      ) : (
        <p className="text-xs font-headline font-bold text-on-surface leading-snug line-clamp-1 pr-7">{item.title}</p>
      )}

      {/* Body — 2 lines */}
      {item.body && (
        <p className="text-[10px] font-body text-on-surface-variant/60 leading-relaxed line-clamp-2 mt-1">
          {item.body}
        </p>
      )}

      {/* Bottom metadata row: channel-label tag + timestamp */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-outline-variant/15">
        <span className={`px-1.5 py-0.5 rounded border text-[8px] font-label font-black uppercase tracking-widest ${color}`}>
          {item.channelLabel}
        </span>
        <span className="ml-auto text-[8px] font-mono text-on-surface-variant/40 flex items-center gap-1 shrink-0">
          <Clock className="w-2 h-2" />{timeAgo(item.ts_raw || item.timestamp, dateFormat)}
        </span>
      </div>
    </div>
  )
}

function playChime() {
  try {
    const audio = new Audio('/sounds/notification.mp3')
    audio.volume = 0.6
    void audio.play().catch(() => {})
  } catch { /* audio may be blocked until user interaction */ }
}

/**
 * Bell-icon FAB + popover. Single notification surface.
 *
 * Behaviour:
 * - FAB shows unread badge; click toggles popover.
 * - Popover only renders unread items (read ones are filtered out, never shown).
 * - When new unread items arrive, popover auto-opens and a chime plays —
 *   it stays open until the user closes it (the merged behavior from the
 *   old toast stack).
 * - Marking a card as read fades + collapses it with a 220ms CSS transition;
 *   the actual readIds/localStorage write is delayed until the animation ends
 *   so the next card slides up smoothly into the freed space.
 * - When unread hits 0 the popover shows an "All Caught Up!" empty state.
 * - The popover container is fully transparent — each card stands on its own
 *   tinted glass background so they read like the floating toasts they
 *   replaced.
 * - Read state is shared with the global Mission Control sidebar via the
 *   `notifications-read-ids` localStorage key.
 */
export function NotificationsFab({
  channels, open, onToggleOpen, onForceOpen, slideClass,
}: {
  channels: FeedChannel[]
  open: boolean
  onToggleOpen: () => void
  /** Programmatically open the popover (used when new arrivals are detected). */
  onForceOpen: () => void
  /** Tailwind class to apply when a side panel pushes content (e.g. 'md:-translate-x-72'). */
  slideClass?: string
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const lastSeenRef = useRef<Map<string, string>>(new Map())
  const isInitRef = useRef(false)
  const readIdsRef = useRef<Set<string>>(new Set())
  const openRef = useRef(false)

  useEffect(() => { readIdsRef.current = readIds }, [readIds])
  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY)
      const set = new Set<string>(raw ? JSON.parse(raw) : [])
      setReadIds(set)
      readIdsRef.current = set
    } catch { /* keep default */ }
  }, [])

  // Detect new arrivals across channels and auto-open + chime.
  // Skip the very first run so we don't toast everything that was already there
  // when the page loaded.
  useEffect(() => {
    if (!isInitRef.current) {
      for (const ch of channels) {
        if (ch.messages.length > 0) {
          lastSeenRef.current.set(ch.id, ch.messages[0].ts_raw ?? '')
        }
      }
      isInitRef.current = true
      return
    }
    let hasNewUnread = false
    for (const ch of channels) {
      if (!ch.messages.length || ch.error) continue
      if (MOTD_CHANNEL_IDS.has(ch.id)) continue
      const latest = ch.messages[0]
      const lastTs = lastSeenRef.current.get(ch.id) ?? ''
      if (latest.ts_raw && latest.ts_raw > lastTs) {
        const id = `${ch.id}-${latest.id}`
        if (!readIdsRef.current.has(id)) hasNewUnread = true
        lastSeenRef.current.set(ch.id, latest.ts_raw)
      }
    }
    if (hasNewUnread) {
      if (!openRef.current) onForceOpen()
      playChime()
    }
  }, [channels, onForceOpen])

  const toItem = useCallback((ch: FeedChannel, m: FeedMessage): NotifItem => ({
    id: `${ch.id}-${m.id}`,
    channelId: ch.id,
    channelLabel: ch.label,
    title: m.title,
    body: m.body || undefined,
    url: m.url || undefined,
    timestamp: m.timestamp,
    ts_raw: m.ts_raw ?? '',
    discord_jump_url: m.discord_jump_url || undefined,
    source: m.source || undefined,
  }), [])

  const unreadItems = useMemo(() =>
    channels
      .filter(c => !MOTD_CHANNEL_IDS.has(c.id))
      .flatMap(ch => ch.messages.map(m => toItem(ch, m)))
      .filter(i => !readIds.has(i.id))
      .sort((a, b) => b.ts_raw.localeCompare(a.ts_raw)),
    [channels, readIds, toItem]
  )

  const unreadCount = unreadItems.length

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!popoverRef.current) return
      // Don't close when clicking the FAB itself (handled by its own click)
      if (popoverRef.current.contains(target)) return
      const fab = document.getElementById('sc-feed-notif-fab')
      if (fab?.contains(target)) return
      onToggleOpen()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onToggleOpen])

  const handleMarkRead = useCallback((id: string) => {
    setRemovingIds(s => {
      const n = new Set(s); n.add(id); return n
    })
    setTimeout(() => {
      setReadIds(prev => {
        const next = new Set(prev); next.add(id)
        try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
        return next
      })
      setRemovingIds(s => {
        const n = new Set(s); n.delete(id); return n
      })
    }, 220)
  }, [])

  const handleMarkAllRead = useCallback(() => {
    setReadIds(prev => {
      const next = new Set(prev)
      unreadItems.forEach(i => next.add(i.id))
      try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [unreadItems])

  const handleMarkAllUnread = useCallback(() => {
    setReadIds(new Set())
    try { localStorage.removeItem(NOTIF_READ_KEY) } catch { /* ignore */ }
  }, [])

  return (
    <>
      {/* Popover — anchored above the FAB. Container is transparent so each
          card reads as an individual tinted-glass tile (matches the look of
          the floating toasts this replaces). The header is its own glass
          pill above the card stack. */}
      {open && (
        <div
          ref={popoverRef}
          className={`fixed bottom-[15.5rem] right-6 z-30 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] flex flex-col gap-2 mc-slide-in transition-transform duration-200 ease-in-out ${slideClass ?? ''}`}
        >
          <div className="glass-card rounded-xl px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-container" />
              <span className="text-xs font-headline font-bold uppercase tracking-widest text-on-surface">Notifications</span>
              {unreadCount > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-primary-container/20 text-primary-container text-[9px] font-black flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-label font-black uppercase tracking-widest text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container/40 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  All read
                </button>
              )}
              {readIds.size > 0 && (
                <button
                  onClick={handleMarkAllUnread}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-label font-black uppercase tracking-widest text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container/40 transition-colors"
                  title="Restore all as unread"
                >
                  <RotateCcw className="w-3 h-3" />
                  All unread
                </button>
              )}
              <button
                onClick={onToggleOpen}
                className="p-1 rounded text-on-surface-variant/60 hover:text-on-surface transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hidden">
            {unreadCount === 0 ? (
              <div className="glass-card rounded-xl flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-primary-container/10 border border-primary-container/30 flex items-center justify-center">
                  <CheckCheck className="w-7 h-7 text-primary-container" />
                </div>
                <p className="text-sm font-headline font-bold text-on-surface">All Caught Up!</p>
                <p className="text-[11px] font-label text-on-surface-variant/50 leading-relaxed max-w-[260px]">
                  No unread notifications. New activity from your feeds will appear here.
                </p>
                {readIds.size > 0 && (
                  <button
                    onClick={handleMarkAllUnread}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container/30 text-[10px] font-label font-black uppercase tracking-widest text-on-surface-variant/70 hover:text-on-surface hover:border-primary-container/40 hover:bg-primary-container/5 transition-colors"
                    title="Restore all notifications as unread"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Mark everything unread
                  </button>
                )}
              </div>
            ) : (
              unreadItems.map(item => {
                const leaving = removingIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    className={`transition-all duration-[220ms] ease-out ${
                      leaving ? 'opacity-0 max-h-0 -translate-x-4 overflow-hidden' : 'opacity-100 max-h-[600px] translate-x-0'
                    }`}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '0 110px' }}
                  >
                    <NotifCard item={item} isRead={false} onToggle={() => handleMarkRead(item.id)} />
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        id="sc-feed-notif-fab"
        onClick={onToggleOpen}
        title={unreadCount === 0 ? 'All caught up' : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
        className={`fixed bottom-24 right-6 z-30 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ease-in-out shadow-lg ${
          open
            ? 'bg-primary-container text-on-primary-container'
            : unreadCount > 0
              ? 'bg-surface-container-high text-primary-container border border-primary-container/40 hover:brightness-110'
              : 'bg-surface-container-high text-on-surface-variant/60 border border-outline-variant/40 hover:text-on-surface'
        } ${slideClass ?? ''}`}
      >
        {open ? <X className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums shadow-md ring-2 ring-surface" style={{ background: 'var(--mc-notif-badge)', color: 'var(--mc-notif-badge-fg)' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
