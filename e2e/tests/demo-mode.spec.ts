/**
 * Demo mode tests — requires a separately running demo server.
 * Run with: OPENKK_DEMO_URL=http://127.0.0.1:4312 npx playwright test demo-mode
 *
 * These tests verify that the demo (memory + seed) mode works correctly.
 * They are skipped if OPENKK_DEMO_URL is not set, so the CI matrix can
 * opt-in explicitly without affecting the default dev-mode test run.
 */
import { expect, test } from "@playwright/test";

const DEMO_URL = process.env["OPENKK_DEMO_URL"];

test.describe("demo mode", () => {
  test.skip(!DEMO_URL, "OPENKK_DEMO_URL not set — skipping demo-mode tests");

  test("shows seed fiscal period on first load", async ({ page }) => {
    await page.goto(DEMO_URL!);
    await expect(page.getByText("デモ期間")).toBeVisible({ timeout: 15_000 });
  });

  test("shows デモ版 edition label in the sidebar", async ({ page }) => {
    await page.goto(DEMO_URL!);
    await expect(page.getByText("デモ版")).toBeVisible({ timeout: 10_000 });
  });

  test("seed entries are pre-loaded and visible in the journal list", async ({
    page,
  }) => {
    await page.goto(`${DEMO_URL}/entries`);
    // seed data contains entries for each month; the current month
    // is mocked to 2026-09 in demo mode
    await expect(page.getByText("2026年9月")).toBeVisible({ timeout: 10_000 });
  });

  test("seed fixed assets are pre-loaded", async ({ page }) => {
    await page.goto(`${DEMO_URL}/assist/fixed-assets`);
    await expect(page.getByText("MacBook Pro 14インチ")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("analytics page renders trend chart data from seed entries", async ({
    page,
  }) => {
    await page.goto(`${DEMO_URL}/steps/journalizing/analytics`);
    // chart shows month labels; seed covers Jan–Sep 2026
    await expect(page.getByText("1月")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("9月")).toBeVisible();
  });
});
