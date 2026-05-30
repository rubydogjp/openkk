import { test, expect } from "@playwright/test";

// 配信された静的 export に対する起動 smoke。
// dev サーバではなく「ビルド成果物 + 本番ヘッダー(COOP/COEP)」を検証するのが目的。
const MODE = process.env.MODE === "prod" ? "prod" : "demo";

// ユーザーが到達する主要ルート。アセット欠落・JS エラーの面で全画面を見張る。
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

test(`export smoke (${MODE}): 全ルートにアセット欠落・JS エラーが無い`, async ({
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

test(`export smoke (${MODE}): デモのお礼文言が表示される`, async ({ page }) => {
  test.skip(MODE !== "demo", "お礼文言はデモ版のみ");
  await page.goto("/steps/next-fiscal-period", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await expect(page.locator("body")).toContainText("ありがとう");
});
