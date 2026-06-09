import { defineConfig, devices } from "@playwright/test";

const OPENKK_DEV_URL = "http://127.0.0.1:4306";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
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
