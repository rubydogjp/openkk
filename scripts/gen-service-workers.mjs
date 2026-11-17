#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { formatGenerated } from "./format-generated.mjs";

const commonRoutes = [
  "/",
  "/steps/",
  "/steps/fiscal-period-settings/",
  "/steps/opening-bs/",
  "/steps/journalizing/",
  "/steps/journalizing/analytics/",
  "/steps/document-receive/",
  "/steps/closing/",
  "/steps/next-fiscal-period/",
  "/entries/",
  "/assist/",
  "/assist/fixed-assets/",
  "/assist/opening-carryover/",
  "/fiscal-periods/",
  "/fiscal-periods/new/",
  "/install/",
];

const bundleRoutes = {
  original: commonRoutes,
  sim: [...commonRoutes, "/debug/"],
  demo: commonRoutes,
};

const PUBLIC_ASSET_DIRECTORIES = ["icons", "images"];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const routesPlaceholder = "__OPENKK_APP_SHELL_ROUTES__";
const publicAssetsPlaceholder = "__OPENKK_PUBLIC_ASSETS__";
const template = readFileSync(
  path.join(scriptDirectory, "service-worker.template.js"),
  "utf8",
);
for (const placeholder of [routesPlaceholder, publicAssetsPlaceholder]) {
  if (template.split(placeholder).length !== 2) {
    throw new Error(
      `Service worker template must contain one ${placeholder} placeholder`,
    );
  }
}

function publicAssets(bundle) {
  const publicDirectory = path.join(
    rootDirectory,
    "packages",
    `bundle-${bundle}`,
    "public",
  );
  return PUBLIC_ASSET_DIRECTORIES.flatMap((directory) =>
    readdirSync(path.join(publicDirectory, directory))
      .filter((name) => !name.startsWith("."))
      .sort()
      .map((name) => `/${directory}/${name}`),
  );
}

const checkOnly = process.argv.includes("--check");
const bundleArgument = process.argv.find((argument) =>
  argument.startsWith("--bundle="),
);
const requestedBundle = bundleArgument?.slice("--bundle=".length);
const bundles =
  requestedBundle == null
    ? Object.keys(bundleRoutes)
    : Object.hasOwn(bundleRoutes, requestedBundle)
      ? [requestedBundle]
      : [];

if (bundles.length === 0) {
  throw new Error(`Unknown service worker bundle: ${requestedBundle}`);
}

const staleFiles = [];
for (const bundle of bundles) {
  const routes = bundleRoutes[bundle];
  const outputPath = path.join(
    rootDirectory,
    "packages",
    `bundle-${bundle}`,
    "public",
    "sw.js",
  );
  const generated = await formatGenerated(
    outputPath,
    template
      .replace(routesPlaceholder, JSON.stringify(routes))
      .replace(publicAssetsPlaceholder, JSON.stringify(publicAssets(bundle))),
  );
  if (checkOnly) {
    if (readFileSync(outputPath, "utf8") !== generated) {
      staleFiles.push(path.relative(rootDirectory, outputPath));
    }
  } else {
    writeFileSync(outputPath, generated);
  }
}

if (staleFiles.length > 0) {
  throw new Error(
    `Generated service workers are stale: ${staleFiles.join(", ")}`,
  );
}
