import { test, expect } from "@playwright/test";

// 配信された静的 export に対する起動 smoke。
// dev サーバではなく「ビルド成果物 + 本番ヘッダー(COOP/COEP)」を検証するのが目的。
const MODE = process.env.MODE === "prod" ? "prod" : "demo";

test(`export smoke (${MODE}): アセット欠落・JS エラーがない`, async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // /icons /images /manifest.json などの public アセットが 404 していないこと
  expect(failed, `failed requests:\n${failed.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test(`export smoke (${MODE}): ローカル DB が初期化できる`, async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await expect(page.locator("body")).not.toContainText("初期化に失敗");
});
