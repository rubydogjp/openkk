// Download 版 (PWA) 用 service worker。
// オフラインでも主要ルートのアプリ shell と既訪問ページが動くように cache を握る。
//
// 戦略:
//   install                 → 主要な静的 export ルート、RSC payload、静的 asset を事前 cache
//   document (HTML)         → network-first (新しい deploy を取りに行く)
//   static (js/css/wasm/...) → cache-first (immutable assets を高速に返す)
//   その他                   → passthrough (fetch そのまま)
//
// 更新導線: 各 deploy で registration URL の ?v= を変える (consumer 側で
// process.env.NEXT_PUBLIC_BUILD_ID を渡す)。URL が変わると browser は新しい
// SW を fetch、activate で古い cache を捨てる。

const version = new URL(self.location.href).searchParams.get("v") ?? "default";
const CACHE_NAME = `openkk-app-${version}`;
const APP_SHELL_ROUTES = [
  "/",
  "/steps",
  "/steps/fiscal-period-settings",
  "/steps/opening-bs",
  "/steps/journalizing",
  "/steps/journalizing/analytics",
  "/steps/document-receive",
  "/steps/closing",
  "/steps/next-fiscal-period",
  "/entries",
  "/assist",
  "/assist/fixed-assets",
  "/assist/opening-carryover",
  "/fiscal-periods",
  "/fiscal-periods/new",
  "/install",
  "/debug",
];
const PRECACHE_URLS = [
  ...APP_SHELL_ROUTES,
  ...APP_SHELL_ROUTES.map((route) =>
    route === "/" ? "/index.txt" : `${route}/index.txt`,
  ),
  "/manifest.json",
  "/favicon.ico",
  "/apple-icon.png",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheAppShell());
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
  if (event.request.destination === "manifest") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (
    /\.(js|css|wasm|png|jpg|jpeg|svg|ico|ttf|woff2?|txt)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  // それ以外は default fetch (cache しない)
});

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const queue = [...PRECACHE_URLS];
  const queued = new Set(queue);
  const fetched = new Set();

  while (queue.length > 0 && fetched.size < 250) {
    const pathname = queue.shift();
    fetched.add(pathname);

    const request = new Request(new URL(pathname, self.location.origin), {
      cache: "reload",
    });
    try {
      const response = await fetch(request);
      if (!response.ok) continue;
      await cache.put(request, response.clone());

      if (isDiscoverableText(response)) {
        const text = await response.clone().text();
        for (const asset of discoverSameOriginAssets(text, request.url)) {
          if (!queued.has(asset) && !fetched.has(asset)) {
            queued.add(asset);
            queue.push(asset);
          }
        }
      }
    } catch {
      // Installation should not fail just because one route is temporarily unavailable.
    }
  }
}

function isDiscoverableText(response) {
  const type = response.headers.get("Content-Type") ?? "";
  return (
    type.includes("text/html") ||
    type.includes("text/css") ||
    type.includes("text/plain") ||
    type.includes("text/javascript")
  );
}

function discoverSameOriginAssets(text, baseUrl) {
  const assets = new Set();
  const patterns = [
    /(?:src|href)=["']([^"']+)["']/g,
    /url\(["']?([^"')]+)["']?\)/g,
    /["'](\/_next\/static\/[^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      tryAddAsset(assets, match[1], baseUrl);
    }
  }
  return assets;
}

function tryAddAsset(assets, value, baseUrl) {
  if (value == null || value.startsWith("data:")) return;
  const url = new URL(value, baseUrl);
  if (url.origin !== self.location.origin) return;
  if (!isPrecacheAsset(url.pathname)) return;
  assets.add(url.pathname);
}

function isPrecacheAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-icon.png" ||
    pathname === "/icon.svg" ||
    pathname === "/manifest.json"
  );
}

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
