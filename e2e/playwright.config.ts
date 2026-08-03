import { defineConfig, devices } from "@playwright/test";

const OPENKK_DEV_URL = "http://localhost:4306";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  // 締めフローの筋書きは手順が長い。Next 16 の dev は 15 より実行が遅く、
  // 90 秒では届かなくなったので広げる (本番ビルドの速さとは別の話)。
  timeout: 180_000,
  retries: 2,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: OPENKK_DEV_URL,
    screenshot: "on",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm --workspace @rubydogjp/openkk-sim run dev:e2e",
    port: 4306,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
