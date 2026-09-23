import { test, expect } from "@playwright/test";

const ROUTES = [
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
  "/debug",
];

test("export smoke (prod): 全ルートにアセット欠落・JS エラーが無い", async ({
  page,
}) => {
  const failed: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).not.toContainText("初期化に失敗");
  }

  expect(failed, `failed requests:\n${failed.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("export smoke (prod): 2タブ目は単一タブ案内を表示しクラッシュしない", async ({
  page: firstTab,
  context,
}) => {
  await firstTab.goto("/", { waitUntil: "networkidle" });
  await firstTab.waitForTimeout(2500);
  await expect(firstTab.locator("body")).not.toContainText("初期化に失敗");
  await expect(firstTab.locator("body")).not.toContainText("複数のタブ");
  const secondTab = await context.newPage();
  await secondTab.goto("/", { waitUntil: "networkidle" });
  await secondTab.waitForTimeout(2500);
  await expect(secondTab.locator("body")).toContainText("複数のタブ");
  await expect(secondTab.locator("body")).not.toContainText("初期化に失敗");
});
