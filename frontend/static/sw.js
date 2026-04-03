/* DealDrop Service Worker */
const CACHE = 'dealdrop-v1';
const STATIC = [
    '/',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/favicon.svg',
    '/static/manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
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
    const { request } = e;
    // Network-first for API calls
    if (request.url.includes('/api/')) {
        e.respondWith(
            fetch(request).catch(() =>
                new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
            )
        );
        return;
    }
    // Cache-first for everything else
    e.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(res => {
                if (res.ok && request.method === 'GET') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(request, clone));
                }
                return res;
            });
        })
    );
});
