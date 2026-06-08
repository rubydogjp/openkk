import { defineConfig } from "@playwright/test";

// 静的 export (next build の out/) を配信して起動 smoke するための設定。
const PORT = 4308;
const COI = "1";

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
