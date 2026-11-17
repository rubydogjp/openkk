#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ORIGIN = "https://openkk.invalid";
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const CHUNK_REFERENCE_PATTERN =
  /["'](?:\/_next\/)?(static\/(?:chunks|media)\/[^"'?#]+)["']/g;
const BUNDLES = ["original", "sim", "demo"];

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const fullPath = path.join(directory, name);
    return statSync(fullPath).isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

function serve(outDirectory, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = pathname.endsWith("/")
    ? [path.join(outDirectory, relative, "index.html")]
    : [
        path.join(outDirectory, relative),
        path.join(outDirectory, relative, "index.html"),
      ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return new Response(readFileSync(candidate), {
        status: 200,
        headers: {
          "Content-Type":
            CONTENT_TYPES[path.extname(candidate)] ??
            "application/octet-stream",
        },
      });
    }
  }
  return new Response("not found", { status: 404 });
}

async function runPrecache(bundle, outDirectory) {
  const source = readFileSync(
    path.join(rootDirectory, "packages", `bundle-${bundle}`, "public", "sw.js"),
    "utf8",
  );
  const cached = new Set();
  const cache = {
    put: async (request) => {
      cached.add(new URL(request.url).pathname);
    },
    match: async () => undefined,
  };
  const worker = new Function(
    "self",
    "caches",
    "fetch",
    "Request",
    "URL",
    `${source}\nreturn { precacheAppShell, routes: APP_SHELL_ROUTES };`,
  )(
    {
      location: { href: `${ORIGIN}/sw.js?v=check`, origin: ORIGIN },
      addEventListener: () => {},
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    { open: async () => cache, match: async () => undefined },
    async (request) => serve(outDirectory, new URL(request.url).pathname),
    Request,
    URL,
  );
  await worker.precacheAppShell();
  return { cached, routes: worker.routes };
}

function filesTheAppStartsFrom(outDirectory, routes) {
  const routeFiles = routes.flatMap((route) => {
    const directory = path.join(outDirectory, route);
    return readdirSync(directory)
      .filter((name) => /\.(html|txt)$/.test(name))
      .map((name) => path.join(directory, name));
  });
  return [...routeFiles, ...filesUnder(path.join(outDirectory, "_next"))];
}

function requiredPathnames(bundle, outDirectory, routes) {
  const required = new Set();
  for (const file of filesTheAppStartsFrom(outDirectory, routes)) {
    if (![".js", ".html", ".txt", ".css"].includes(path.extname(file))) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(CHUNK_REFERENCE_PATTERN)) {
      const pathname = `/_next/${match[1]}`;
      if (existsSync(path.join(outDirectory, pathname))) required.add(pathname);
    }
  }
  const publicDirectory = path.join(
    rootDirectory,
    "packages",
    `bundle-${bundle}`,
    "public",
  );
  for (const directory of ["icons", "images"]) {
    for (const name of readdirSync(path.join(publicDirectory, directory))) {
      if (!name.startsWith(".")) required.add(`/${directory}/${name}`);
    }
  }
  return required;
}

const problems = [];
let checked = 0;
for (const bundle of BUNDLES) {
  const outDirectory = path.join(
    rootDirectory,
    "packages",
    `bundle-${bundle}`,
    "out",
  );
  if (!existsSync(outDirectory)) continue;
  checked += 1;
  const { cached, routes } = await runPrecache(bundle, outDirectory);
  const missing = [...requiredPathnames(bundle, outDirectory, routes)].filter(
    (pathname) => !cached.has(pathname),
  );
  if (missing.length > 0) {
    problems.push(`bundle-${bundle}: ${missing.sort().join(", ")}`);
  }
}

if (checked === 0) {
  throw new Error("No built app to check. Run npm run build:apps first.");
}
if (problems.length > 0) {
  throw new Error(
    `The service worker does not precache files the app needs offline:\n${problems.join("\n")}`,
  );
}
