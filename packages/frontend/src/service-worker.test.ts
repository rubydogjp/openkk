import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

type ServiceWorkerFunctions = {
  cacheFirst: (request: Request) => Promise<Response>;
  cleanupOldCaches: () => Promise<void>;
  networkFirst: (request: Request) => Promise<Response>;
  precacheAppShell: () => Promise<void>;
};

const workerUrls = [
  new URL("../../openkk/public/sw.js", import.meta.url),
  new URL("../../openkk_sim/public/sw.js", import.meta.url),
  new URL("../../openkk_demo/public/sw.js", import.meta.url),
];

describe("download service worker", () => {
  it("keeps all bundle variants on the same worker implementation", () => {
    const sources = workerUrls.map((url) => readFileSync(url, "utf8"));

    expect(sources[1]).toBe(sources[0]);
    expect(sources[2]).toBe(sources[0]);
  });

  it("uses a pathname cache fallback for offline navigation with a query", async () => {
    const cached = new Response("cached page", { status: 200 });
    const cacheMatch = vi.fn(async () => cached);
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => {
        throw new TypeError("offline");
      }),
      caches: {
        open: vi.fn(),
        match: cacheMatch,
      },
    });
    const request = new Request(
      "https://example.test/assist/fixed-assets?asset=asset-1",
    );

    await expect(networkFirst(request)).resolves.toBe(cached);
    expect(cacheMatch).toHaveBeenCalledWith(request, { ignoreSearch: true });
  });

  it("uses the last known-good page for a transient server failure", async () => {
    const cached = new Response("cached page", { status: 200 });
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => new Response("unavailable", { status: 503 })),
      caches: {
        open: vi.fn(),
        match: vi.fn(async () => cached),
      },
    });

    await expect(
      networkFirst(new Request("https://example.test/entries")),
    ).resolves.toBe(cached);
  });

  it("returns current 4xx responses instead of hiding them with stale cache", async () => {
    const notFound = new Response("not found", { status: 404 });
    const cacheMatch = vi.fn(async () => new Response("stale page"));
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => notFound),
      caches: {
        open: vi.fn(),
        match: cacheMatch,
      },
    });

    await expect(
      networkFirst(new Request("https://example.test/missing")),
    ).resolves.toBe(notFound);
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it("finishes runtime caching before resolving a successful fetch", async () => {
    let finishPut: (() => void) | undefined;
    const put = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPut = resolve;
        }),
    );
    const response = new Response("fresh page", { status: 200 });
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => response),
      caches: {
        open: vi.fn(async () => ({ put })),
        match: vi.fn(),
      },
    });
    let resolved = false;
    const result = networkFirst(
      new Request("https://example.test/entries"),
    ).then((value) => {
      resolved = true;
      return value;
    });

    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(resolved).toBe(false);
    finishPut?.();
    await expect(result).resolves.toBe(response);
  });

  it("serves a fresh response even if the cache write fails", async () => {
    const response = new Response("fresh page", { status: 200 });
    const { cacheFirst } = loadWorker({
      fetch: vi.fn(async () => response),
      caches: {
        open: vi.fn(async () => ({
          match: vi.fn(async () => undefined),
          put: vi.fn(async () => {
            throw new Error("quota exceeded");
          }),
        })),
        match: vi.fn(),
      },
    });

    await expect(
      cacheFirst(new Request("https://example.test/_next/static/app.js")),
    ).resolves.toBe(response);
  });

  it("serves static files from the network when cache storage cannot open", async () => {
    const response = new Response("fresh script", { status: 200 });
    const { cacheFirst } = loadWorker({
      fetch: vi.fn(async () => response),
      caches: {
        open: vi.fn(async () => {
          throw new Error("storage disabled");
        }),
        match: vi.fn(),
      },
    });

    await expect(
      cacheFirst(new Request("https://example.test/_next/static/app.js")),
    ).resolves.toBe(response);
  });

  it("serves a navigation response when only runtime caching fails", async () => {
    const response = new Response("fresh page", { status: 200 });
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => response),
      caches: {
        open: vi.fn(async () => {
          throw new Error("storage disabled");
        }),
        match: vi.fn(),
      },
    });

    await expect(
      networkFirst(new Request("https://example.test/entries")),
    ).resolves.toBe(response);
  });

  it("preserves the network error when the offline cache lookup also fails", async () => {
    const offline = new TypeError("network offline");
    const { networkFirst } = loadWorker({
      fetch: vi.fn(async () => {
        throw offline;
      }),
      caches: {
        open: vi.fn(),
        match: vi.fn(async () => {
          throw new Error("storage disabled");
        }),
      },
    });

    await expect(
      networkFirst(new Request("https://example.test/entries")),
    ).rejects.toBe(offline);
  });

  it("rejects an incomplete install so the previous offline shell stays active", async () => {
    const { precacheAppShell } = loadWorker({
      fetch: vi.fn(async () => new Response("missing", { status: 503 })),
      caches: {
        open: vi.fn(async () => ({ put: vi.fn() })),
        match: vi.fn(),
      },
    });

    await expect(precacheAppShell()).rejects.toThrow(
      "OpenKK app shell precache is incomplete",
    );
  });

  it("deletes only old OpenKK app-shell caches", async () => {
    const remove = vi.fn(async () => true);
    const { cleanupOldCaches } = loadWorker({
      fetch: vi.fn(),
      caches: {
        open: vi.fn(),
        match: vi.fn(),
        keys: vi.fn(async () => [
          "openkk-app-old",
          "openkk-app-test",
          "openkk-user-data",
          "another-app-cache",
        ]),
        delete: remove,
      },
    });

    await expect(cleanupOldCaches()).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("openkk-app-old");
  });

  it("does not block activation when cache storage cannot list caches", async () => {
    const { cleanupOldCaches } = loadWorker({
      fetch: vi.fn(),
      caches: {
        open: vi.fn(),
        match: vi.fn(),
        keys: vi.fn(async () => {
          throw new Error("storage disabled");
        }),
        delete: vi.fn(),
      },
    });

    await expect(cleanupOldCaches()).resolves.toBeUndefined();
  });
});

function loadWorker(input: {
  fetch: typeof fetch;
  caches: {
    open: (...args: unknown[]) => unknown;
    match: (...args: unknown[]) => unknown;
    keys?: (...args: unknown[]) => unknown;
    delete?: (...args: unknown[]) => unknown;
  };
}): ServiceWorkerFunctions {
  const source = readFileSync(workerUrls[0]!, "utf8");
  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "Request",
    "URL",
    `${source}\nreturn { cacheFirst, cleanupOldCaches, networkFirst, precacheAppShell };`,
  );
  return factory(
    {
      location: { href: "https://example.test/sw.js?v=test", origin: "https://example.test" },
      addEventListener: vi.fn(),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
    input.caches,
    input.fetch,
    Request,
    URL,
  ) as ServiceWorkerFunctions;
}
