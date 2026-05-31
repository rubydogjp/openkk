// Download 版 (PWA) 用 service worker。
// オフラインでもアプリ shell + 既訪問ページが動くように cache を握る。
//
// 戦略:
//   document (HTML)         → network-first (新しい deploy を取りに行く)
//   static (js/css/wasm/...) → cache-first (immutable assets を高速に返す)
//   その他                   → passthrough (fetch そのまま)
//
// 更新導線: 各 deploy で registration URL の ?v= を変える (consumer 側で
// process.env.NEXT_PUBLIC_BUILD_ID を渡す)。URL が変わると browser は新しい
// SW を fetch、activate で古い cache を捨てる。

const version =
  new URL(self.location.href).searchParams.get("v") ?? "default";
const CACHE_NAME = `openkk-app-${version}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 自分以外のバージョンの cache を削除
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("openkk-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // 別オリジン (API 等) はそのまま pass-through (cache しない)
  if (url.origin !== self.location.origin) return;
  // GET 以外も cache しない
  if (event.request.method !== "GET") return;

  if (event.request.destination === "document") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (/\.(js|css|wasm|png|jpg|jpeg|svg|ico|ttf|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  // それ以外は default fetch (cache しない)
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}
