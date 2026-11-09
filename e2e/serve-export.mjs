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

async function isFile(candidate) {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const base = join(EXPORT_ROOT, relativePath);
  if (await isFile(base)) return { file: base, redirect: null };
  if (await isFile(join(base, "index.html"))) {
    return pathname.endsWith("/")
      ? { file: join(base, "index.html"), redirect: null }
      : { file: null, redirect: `${urlPath.split("?")[0]}/` };
  }
  if (await isFile(`${base}.html`)) {
    return { file: `${base}.html`, redirect: null };
  }
  return { file: null, redirect: null };
}

const server = createServer(async (request, response) => {
  const headers = {};
  if (CROSS_ORIGIN_ISOLATED) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  }
  const url = request.url ?? "/";
  const { file, redirect } = await resolveFile(url);
  if (redirect != null) {
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    response.writeHead(301, { ...headers, Location: `${redirect}${query}` });
    response.end();
    return;
  }
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
