import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      { source: '/sc-feed', destination: '/', permanent: true },
      { source: '/sc-feed/:path*', destination: '/:path*', permanent: true },
    ]
  },
}

export default nextConfig
