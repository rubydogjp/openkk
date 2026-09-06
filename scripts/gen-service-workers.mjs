#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const commonRoutes = [
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
];

const bundleRoutes = {
  openkk: commonRoutes,
  openkk_sim: [...commonRoutes, "/debug"],
  openkk_demo: commonRoutes,
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const routesPlaceholder = "__OPENKK_APP_SHELL_ROUTES__";
const template = readFileSync(
  path.join(scriptDirectory, "service-worker.template.js"),
  "utf8",
);
if (template.split(routesPlaceholder).length !== 2) {
  throw new Error("Service worker template must contain one routes placeholder");
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
  const generated = template.replace(
    routesPlaceholder,
    JSON.stringify(routes, null, 2),
  );
  const outputPath = path.join(rootDirectory, "packages", bundle, "public", "sw.js");
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
