import { defineConfig, devices } from "@playwright/test";

const OPENKK_DEV_PORT = 4306;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  retries: 2,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${OPENKK_DEV_PORT}`,
    screenshot: "on",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm --workspace @rubydogjp/openkk-sim run dev:e2e",
    port: OPENKK_DEV_PORT,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
