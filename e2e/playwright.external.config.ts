import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    screenshot: "on",
    trace: "on-first-retry",
  },
});
