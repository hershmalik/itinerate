const CACHE = 'aitinerate-v10';
const STATIC = [
  '/',
  '/styles.css',
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

  // Never intercept API calls or cross-origin requests
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/generate-itinerary') ||
      url.hostname !== self.location.hostname) {
    return;
  }

  // Only serve cache-first for the explicitly pre-cached STATIC list
  const isPreCached = STATIC.some(s => {
    try { return new URL(s, self.location.origin).href === url.href; } catch { return s === url.pathname; }
  });

  if (isPreCached) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => new Response('', { status: 503 })))
    );
  } else {
    // Network-first for everything else (HTML, JS, CSS with version strings)
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request) || new Response('Offline', { status: 503 }))
    );
  }
});
