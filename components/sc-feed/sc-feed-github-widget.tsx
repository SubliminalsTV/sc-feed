'use client'

import { useEffect, useState } from 'react'
import { GitFork, Github, Star, Tag } from 'lucide-react'

/**
 * GitHub repo widget for the SC Feed header.
 *
 * Style mirrors MkDocs Material's `.md-source` widget — small icon on the
 * left, repo label + a thin row of facts (latest version / stars / forks).
 *
 * Data is fetched directly from the GitHub public REST API client-side and
 * cached in localStorage for 1 hour per repo. This avoids any server-side
 * GitHub API usage and keeps each user's request volume well below the
 * unauthenticated 60/hr per-IP rate limit (1 fetch per hour at most).
 *
 * Cache key: `gh-stats-<owner>-<repo>` → { tag, stars, forks, fetchedAt }
 */

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface RepoStats {
  tag: string | null
  stars: number
  forks: number
}

interface CachedRepoStats extends RepoStats {
  fetchedAt: number
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

async function fetchRepoStats(owner: string, repo: string): Promise<RepoStats> {
  const [repoRes, releaseRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Accept: 'application/vnd.github+json' } }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }),
  ])
  if (!repoRes.ok) throw new Error(`GitHub repo HTTP ${repoRes.status}`)
  const repoData: { stargazers_count: number; forks_count: number } = await repoRes.json()
  // Releases endpoint returns 404 for repos without any releases — treat that as null tag, not an error.
  let tag: string | null = null
  if (releaseRes.ok) {
    const r: { tag_name?: string } = await releaseRes.json()
    tag = r.tag_name ?? null
  }
  return { tag, stars: repoData.stargazers_count ?? 0, forks: repoData.forks_count ?? 0 }
}

export function GithubWidget({
  owner = 'SubliminalsTV',
  repo = 'Subs-Curated-Bindings',
  className = '',
}: {
  owner?: string
  repo?: string
  className?: string
}) {
  const [stats, setStats] = useState<RepoStats | null>(null)
  const cacheKey = `gh-stats-${owner}-${repo}`

  useEffect(() => {
    let cancelled = false
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const cached: CachedRepoStats = JSON.parse(raw)
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          setStats({ tag: cached.tag, stars: cached.stars, forks: cached.forks })
          return
        }
      }
    } catch { /* ignore */ }
    fetchRepoStats(owner, repo)
      .then(s => {
        if (cancelled) return
        setStats(s)
        try { localStorage.setItem(cacheKey, JSON.stringify({ ...s, fetchedAt: Date.now() })) } catch { /* ignore */ }
      })
      .catch(() => { /* widget silently shows skeleton if API fails */ })
    return () => { cancelled = true }
  }, [owner, repo, cacheKey])

  const repoUrl = `https://github.com/${owner}/${repo}`

  return (
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2.5 px-2 py-1 rounded-md hover:bg-surface-container-high/30 transition-colors ${className}`}
      title={`${owner}/${repo} on GitHub`}
    >
      <Github className="w-5 h-5 text-on-surface shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-label font-black text-on-surface leading-none">
          GitHub
        </span>
        <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant/70 leading-none">
          {stats ? (
            <>
              {stats.tag && (
                <span className="inline-flex items-center gap-0.5" title="Latest release">
                  <Tag className="w-2.5 h-2.5" strokeWidth={2.25} /> {stats.tag}
                </span>
              )}
              <span className="inline-flex items-center gap-0.5" title="Stars">
                <Star className="w-2.5 h-2.5" strokeWidth={2.25} /> {fmt(stats.stars)}
              </span>
              <span className="inline-flex items-center gap-0.5" title="Forks">
                <GitFork className="w-2.5 h-2.5" strokeWidth={2.25} /> {fmt(stats.forks)}
              </span>
            </>
          ) : (
            <span className="opacity-30">— · — · —</span>
          )}
        </div>
      </div>
    </a>
  )
}
