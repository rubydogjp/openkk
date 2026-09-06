const version = new URL(self.location.href).searchParams.get("v") ?? "default";
const CACHE_PREFIX = "openkk-app-";
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
const MAX_PRECACHE_RESOURCE_COUNT = 250;
const STATIC_ASSET_PATH_PATTERN =
  /\.(js|css|wasm|png|jpg|jpeg|svg|ico|ttf|woff2?|txt)$/;
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
  "/install"
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
  event.waitUntil(activateWorker());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isSameOriginGetRequest(event.request, url)) return;

  if (isNetworkFirstRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (STATIC_ASSET_PATH_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
  }
});

async function activateWorker() {
  await cleanupOldCaches();
  await self.clients.claim();
}

function isSameOriginGetRequest(request, url) {
  return url.origin === self.location.origin && request.method === "GET";
}

function isNetworkFirstRequest(request) {
  return (
    request.destination === "document" || request.destination === "manifest"
  );
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const pendingResources = PRECACHE_URLS.map((pathname) => ({
    pathname,
    isAppShell: true,
  }));
  const queuedPathnames = new Set(PRECACHE_URLS);
  const fetchedPathnames = new Set();
  const unreachableAppShellPathnames = new Set();
  const markUnreachable = (resource) => {
    if (resource.isAppShell) {
      unreachableAppShellPathnames.add(resource.pathname);
    }
  };

  while (
    pendingResources.length > 0 &&
    fetchedPathnames.size < MAX_PRECACHE_RESOURCE_COUNT
  ) {
    const resource = pendingResources.shift();
    fetchedPathnames.add(resource.pathname);

    const request = new Request(
      new URL(resource.pathname, self.location.origin),
      { cache: "reload" },
    );
    try {
      const response = await fetch(request);
      if (!response.ok) {
        markUnreachable(resource);
        continue;
      }
      await cache.put(request, response.clone());

      if (isDiscoverableText(response)) {
        const text = await response.clone().text();
        for (const asset of discoverSameOriginAssets(text, request.url)) {
          if (queuedPathnames.has(asset)) continue;
          queuedPathnames.add(asset);
          pendingResources.push({ pathname: asset, isAppShell: false });
        }
      }
    } catch {
      markUnreachable(resource);
    }
  }

  for (const resource of pendingResources) markUnreachable(resource);

  if (unreachableAppShellPathnames.size > 0) {
    throw new Error(
      `OpenKK app shell precache is incomplete: ${[...unreachableAppShellPathnames].join(", ")}`,
    );
  }
}

async function cleanupOldCaches() {
  const cacheNames = await readCacheNamesIfAvailable();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(deleteCacheIfPossible),
  );
}

async function readCacheNamesIfAvailable() {
  try {
    return await caches.keys();
  } catch {
    return [];
  }
}

async function deleteCacheIfPossible(name) {
  try {
    await caches.delete(name);
  } catch {}
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

function isSourceCodeFragment(value) {
  return value.includes("\\") || value.includes("${");
}

function tryAddAsset(assets, value, baseUrl) {
  if (value == null || value.startsWith("data:")) return;
  if (isSourceCodeFragment(value)) return;
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return;
  }
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
  const cached = await readFromCurrentCacheIfAvailable(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cacheResponseIfPossible(request, response);
  }
  return response;
}

async function networkFirst(request) {
  let networkFailure;
  let serverFailureResponse;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheResponseIfPossible(request, response);
      return response;
    }
    if (response.status < 500) return response;
    serverFailureResponse = response;
  } catch (error) {
    networkFailure = error;
  }
  const cached = await readFromAnyCacheIfAvailable(request);
  if (cached) return cached;
  if (serverFailureResponse) return serverFailureResponse;
  throw networkFailure;
}

async function readFromCurrentCacheIfAvailable(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request, { ignoreSearch: true });
  } catch {
    return undefined;
  }
}

async function readFromAnyCacheIfAvailable(request) {
  try {
    return await caches.match(request, { ignoreSearch: true });
  } catch {
    return undefined;
  }
}

async function cacheResponseIfPossible(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {}
}
