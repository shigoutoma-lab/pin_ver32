// 現調図面ピン留めツール オフライン用 Service Worker
// index.html と同じフォルダに置く。HTTPS または localhost で有効。
// v12: ページ本体(HTML)はオンライン時に最新版を優先して取得し、
//      オフライン・電波が弱い(2.5秒応答なし)ときだけキャッシュで即表示する。
const CACHE_NAME = 'survey-cache-v12';
const PRECACHE = ['./'];
const NAV_TIMEOUT_MS = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE.map(u => cache.add(new URL(u, self.registration.scope).href)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    // ページ本体: ネットワーク優先(一定時間応答がなければキャッシュ)
    if (req.mode === 'navigate') {
      e.waitUntil(net);
      const timeout = new Promise(r => setTimeout(() => r(null), hit ? NAV_TIMEOUT_MS : 15000));
      const res = await Promise.race([net, timeout]);
      if (res) return res;
      if (hit) return hit;
      const k = (await cache.keys()).find(r => /(\.html?|\/)$/.test(new URL(r.url).pathname));
      if (k) return cache.match(k);
      return Response.error();
    }

    // その他: キャッシュ優先で即表示し、裏で更新
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || Response.error();
  })());
});
