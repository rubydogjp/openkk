import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  reporter: [["list"]],
  use: { screenshot: "only-on-failure" },
  projects: [
    {
      name: "original",
      testDir: "./tests-export",
      use: { baseURL: "http://localhost:4308" },
    },
    {
      name: "demo",
      testDir: "./tests-demo",
      use: { baseURL: "http://localhost:4309" },
    },
    {
      name: "file",
      testDir: "./tests-file",
      use: { baseURL: "http://localhost:4310", channel: "chrome" },
    },
  ],
  webServer: ["openkk", "openkk_demo", "openkk_file"].map((bundle, index) => ({
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
