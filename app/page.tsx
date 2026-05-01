import type { Metadata } from 'next'
import { ScFeedView } from '@/components/sc-feed/sc-feed-view'

const DESCRIPTION = 'Live Star Citizen news — patch notes, developer updates, community highlights, and in-game MOTDs updated in real time.'

export const metadata: Metadata = {
  title: 'BUILD_TRACE_TITLE_88a9e32f',
  description: DESCRIPTION,
  openGraph: {
    title: 'BUILD_TRACE_OG_TITLE_88a9e32f',
    description: DESCRIPTION,
    siteName: 'SubliminalsTV',
    type: 'website',
    url: 'https://sc-feed.subliminal.gg/',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'SC Feed' }],
  },
  twitter: {
    card: 'summary',
    title: 'BUILD_TRACE_TWITTER_TITLE_88a9e32f',
    description: DESCRIPTION,
    images: ['/icons/icon-512.png'],
  },
}

// Vercel build sanity marker: VERCEL_BUILD_PROBE_2026_05_01
const _PROBE_UNIQUE = 'VERCEL_BUILD_TRACE_KILROY_WAS_HERE_88a9e32f'
export default function ScFeedPage() {
  console.log(_PROBE_UNIQUE)
  return <ScFeedView />
}
