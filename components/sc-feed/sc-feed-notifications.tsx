'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, Check, CheckCheck, ChevronDown, ChevronUp,
  Clock, ExternalLink, RotateCcw, Sparkles, X,
} from 'lucide-react'
import type { FeedChannel, FeedMessage } from '@/app/api/sc-feed/route'
import {
  MOTD_CHANNEL_IDS, NOTIF_COLORS, NOTIF_READ_KEY, PILL, PIPELINE_CHANNEL_IDS,
  TRACKER_CATS, useFeedPrefs, type NotifItem,
} from './sc-feed-types'
import { getRsiStatusTheme, getSourceInfo, getTrackerCatKey, timeAgo } from './sc-feed-utils'

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
  const isTrackerSC = item.channelId === 'cig-news'
  const trackerKey = isTrackerSC ? getTrackerCatKey(item.source ?? '') : undefined
  const trackerCat = trackerKey ? TRACKER_CATS[trackerKey] : undefined
  const sourceInfo = getSourceInfo(item.url)
  const showSource = sourceInfo && item.url && !(trackerCat && sourceInfo.label === trackerCat.label)

  // Build pills first so we can compute first + overflow count for the truncated metadata row.
  type P = { key: string; node: React.ReactNode }
  const pills: P[] = []
  if (item.motdLabels && item.motdLabels.length > 0) {
    pills.push({ key: 'motd', node: <span className={`${PILL} border-amber-400/60 bg-amber-400/10 text-amber-300`}><Sparkles className="w-2.5 h-2.5" />MOTD</span> })
    item.motdLabels.slice(0, 1).forEach((label, i) => pills.push({ key: `motdsub${i}`, node: <span className={`${PILL} ${label === 'SC MOTD' ? 'border-blue-400/40 bg-blue-400/10 text-blue-300' : 'border-green-400/40 bg-green-400/10 text-green-300'}`}>{label === 'SC MOTD' ? 'SC Testing' : 'ETF Testing'}</span> }))
  }
  if (trackerCat) {
    const Icon = trackerCat.icon
    pills.push({ key: 'cat', node: <span className={`${PILL} ${trackerCat.cls}`}><Icon className="w-2.5 h-2.5" />{trackerCat.label}</span> })
  }
  if (showSource) pills.push({ key: 'src', node: <a href={item.url!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={`${PILL} ${sourceInfo!.cls}`}>{sourceInfo!.label}</a> })
  if (item.discord_jump_url && !isTrackerSC) pills.push({ key: 'disc', node: <a href={item.discord_jump_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={`${PILL} border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300`}>{PIPELINE_CHANNEL_IDS.has(item.channelId) ? 'Pipeline' : 'Post'}</a> })

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

      {/* Bottom metadata row: first pill + (+N) overflow + channel label + timestamp */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-outline-variant/15">
        {pills.length > 0 && (
          <>
            {pills[0].node}
            {pills.length > 1 && (
              <span className="text-[9px] font-label font-black text-on-surface-variant/50 tabular-nums">
                +{pills.length - 1}
              </span>
            )}
          </>
        )}
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

/**
 * Bell-icon FAB + popover. Replaces the old NotificationsPanel sidebar.
 *
 * Behaviour:
 * - FAB shows unread badge; click toggles popover.
 * - Popover only renders unread items (read ones are filtered out, never shown).
 * - Marking a card as read fades + collapses it with a 220ms CSS transition;
 *   the actual readIds/localStorage write is delayed until the animation ends
 *   so the next card slides up smoothly into the freed space.
 * - When unread hits 0 the popover shows an "All Caught Up!" empty state.
 * - Each card slot uses `content-visibility: auto` for cheap off-screen
 *   skipping — keeps the popover responsive even with ~200+ cards.
 * - Read state is shared with the global Mission Control sidebar via the
 *   `notifications-read-ids` localStorage key.
 */
export function NotificationsFab({
  channels, open, onToggleOpen, slideClass,
}: {
  channels: FeedChannel[]
  open: boolean
  onToggleOpen: () => void
  /** Tailwind class to apply when a side panel pushes content (e.g. 'md:-translate-x-72'). */
  slideClass?: string
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY)
      setReadIds(new Set(raw ? JSON.parse(raw) : []))
    } catch { /* keep default */ }
  }, [])

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
      {/* Popover — anchored above the FAB */}
      {open && (
        <div
          ref={popoverRef}
          className={`fixed bottom-44 right-6 z-30 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] flex flex-col rounded-2xl bg-surface-container-high/80 backdrop-blur-md border border-outline-variant/40 shadow-2xl mc-slide-in transition-transform duration-200 ease-in-out ${slideClass ?? ''}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30 shrink-0">
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
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-label font-black uppercase tracking-widest text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  All read
                </button>
              )}
              {readIds.size > 0 && (
                <button
                  onClick={handleMarkAllUnread}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-label font-black uppercase tracking-widest text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors"
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

          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hidden">
            {unreadCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
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
