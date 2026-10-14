/* Only public offline assets belong in this cache. No app/API/Auth responses. */
const CACHE_PREFIX = 'vave-log-offline-';
const CACHE_NAME = CACHE_PREFIX + '__VAVE_OFFLINE_VERSION__';
const OFFLINE_ASSETS = new Map([
  ['/offline.html', 'text/html'], ['/offline.css', 'text/css'],
  ['/offline.js', 'text/javascript'], ['/favicon.svg', 'image/svg+xml'],
]);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate all responses before writing: private-host login redirects are not assets.
    const responses = await Promise.all([...OFFLINE_ASSETS].map(async ([path, mime]) => {
      const request = new Request(new URL(path, self.location.origin), { cache: 'reload', credentials: 'same-origin' });
      const response = await fetch(request);
      if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== self.location.origin) || response.headers.get('content-type')?.split(';')[0].trim() !== mime) throw new Error('Offline asset unavailable');
      return [path, response];
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(responses.map(([path, response]) => cache.put(new URL(path, self.location.origin).href, response)));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'VAVE_ACTIVATE_UPDATE' || !event.source?.url) return;
  if (new URL(event.source.url).origin === self.location.origin) event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (url.search || /^\/(?:api|oauth|auth|\.well-known)(?:\/|$)/.test(url.pathname) || url.pathname === '/healthz') return;
  if (OFFLINE_ASSETS.has(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE_NAME)).match(request)) || fetch(request))());
    return;
  }
  if (request.mode !== 'navigate' || url.pathname.split('/').pop().includes('.')) return;
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      return (await (await caches.open(CACHE_NAME)).match(new URL('/offline.html', self.location.origin).href))
        || new Response('VAVE.LOG is offline. Reconnect and reload. / Offline: Bitte erneut verbinden. / 当前离线，请联网后刷新。', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
  })());
});
