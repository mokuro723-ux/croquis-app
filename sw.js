const CACHE_NAME = 'croquis-timer-v9';
const STATIC_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './sw.js'
];

const RUNTIME_CACHE = 'croquis-runtime-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_CACHE))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;

    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // ナビゲーション(HTML)はネット優先で更新反映を早める
    if (req.mode === 'navigate') {
        e.respondWith(
            (async () => {
                try {
                    const fresh = await fetch(req);
                    const cache = await caches.open(CACHE_NAME);
                    cache.put('./index.html', fresh.clone());
                    return fresh;
                } catch {
                    const cached = await caches.match('./index.html');
                    return cached || Response.error();
                }
            })()
        );
        return;
    }

    // 同一オリジンの静的ファイルはキャッシュ優先
    if (url.origin === self.location.origin) {
        e.respondWith(
            (async () => {
                const cached = await caches.match(req);
                if (cached) return cached;

                try {
                    const fresh = await fetch(req);
                    if (fresh && fresh.status === 200) {
                        const runtime = await caches.open(RUNTIME_CACHE);
                        runtime.put(req, fresh.clone());
                    }
                    return fresh;
                } catch {
                    return Response.error();
                }
            })()
        );
    }
});