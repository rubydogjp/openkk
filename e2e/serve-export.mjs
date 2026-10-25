import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EXPORT_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  process.env.EXPORT_DIR ?? "packages/openkk/out",
);
const PORT = Number(process.env.PORT ?? 4307);
const CROSS_ORIGIN_ISOLATED = process.env.CROSS_ORIGIN_ISOLATED === "1";

const CONTENT_TYPES = {
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
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  const relativePath = normalize(
    decodeURIComponent(urlPath.split("?")[0]),
  ).replace(/^(\.\.[/\\])+/, "");
  const base = join(EXPORT_ROOT, relativePath);
  const candidates = [base, join(base, "index.html"), `${base}.html`];
  for (const candidate of candidates) {
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {}
  }
  return null;
}

const server = createServer(async (request, response) => {
  const headers = {};
  if (CROSS_ORIGIN_ISOLATED) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  }
  const file = await resolveFile(request.url ?? "/");
  if (!file) {
    response.writeHead(404, headers);
    response.end("Not found");
    return;
  }
  const body = await readFile(file);
  headers["Content-Type"] =
    CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
  response.writeHead(200, headers);
  response.end(body);
});

server.listen(PORT, () =>
  console.log(
    `export server on http://localhost:${PORT} (cross-origin isolated: ${CROSS_ORIGIN_ISOLATED})`,
  ),
);
