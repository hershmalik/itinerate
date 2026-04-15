const CACHE = 'aitinerate-v2';
const STATIC = [
  '/',
  '/second-page.html',
  '/styles.css',
  '/index.js',
  '/second-page.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache API calls or external CDNs
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/generate-itinerary') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('openai') ||
      url.hostname.includes('clerk') ||
      url.hostname.includes('jsdelivr') ||
      url.hostname !== self.location.hostname) {
    return;
  }

  // Cache-first for static assets, network-first for HTML
  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request) || new Response('Offline', { status: 503 }))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => new Response('', { status: 503 })))
    );
  }
});
