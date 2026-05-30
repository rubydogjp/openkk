// 静的 export (packages/openkk/out) を配信する最小サーバ。
// e2e の export スモーク用。COI=1 で本番同等の COOP/COEP を付与する。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages/openkk/out");
const PORT = Number(process.env.PORT ?? 4307);
const COI = process.env.COI === "1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  const base = join(ROOT, clean);
  const candidates = [base, join(base, "index.html"), `${base}.html`];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const headers = {};
  if (COI) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  }
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, headers);
    res.end("Not found");
    return;
  }
  const body = await readFile(file);
  headers["Content-Type"] = TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, headers);
  res.end(body);
});

server.listen(PORT, () =>
  console.log(`export server on http://localhost:${PORT} (COI=${COI})`),
);
