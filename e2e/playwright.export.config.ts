import { defineConfig } from "@playwright/test";

const ORIGINAL_URL = "http://localhost:4308";

export default defineConfig({
  timeout: 60_000,
  reporter: [["list"]],
  use: { screenshot: "only-on-failure" },
  projects: [
    {
      name: "original",
      testDir: "./tests-export",
      use: { baseURL: ORIGINAL_URL },
    },
    {
      name: "original-books",
      testDir: "./tests-books",
      use: { baseURL: ORIGINAL_URL, channel: "chrome" },
    },
    {
      name: "demo",
      testDir: "./tests-demo",
      use: { baseURL: "http://localhost:4309" },
    },
  ],
  webServer: ["openkk", "openkk_demo"].map((bundle, index) => ({
    command: "node e2e/serve-export.mjs",
    cwd: process.cwd(),
    env: {
      PORT: String(4308 + index),
      CROSS_ORIGIN_ISOLATED: "1",
      EXPORT_DIR: `packages/${bundle}/out`,
    },
    port: 4308 + index,
    reuseExistingServer: false,
    timeout: 30_000,
  })),
});
