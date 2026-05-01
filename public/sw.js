self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', e => {
  if (!e.data) return
  let data = {}
  try { data = e.data.json() } catch { data = { title: 'SC Feed', body: e.data.text() } }
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'SC Feed', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'sc-feed',
      renotify: true,
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(all => {
      const existing = all.find(c => new URL(c.url).origin === self.location.origin)
      if (existing && 'focus' in existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
