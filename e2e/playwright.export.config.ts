import { defineConfig } from "@playwright/test";

// 静的 export (next build の out/) を配信して起動 smoke するための設定。
// MODE=demo|prod を渡す（prod は本番同等の COOP/COEP を付与）。
const MODE = process.env.MODE === "prod" ? "prod" : "demo";
const PORT = MODE === "prod" ? 4308 : 4307;
const COI = MODE === "prod" ? "1" : "0";

export default defineConfig({
  testDir: "./tests-export",
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: "node e2e/serve-export.mjs",
    cwd: process.cwd(),
    env: { PORT: String(PORT), COI },
    port: PORT,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
