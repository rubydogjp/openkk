import { test, expect } from "@playwright/test";

import { waitUntilBootPhase, waitUntilSettled } from "../helpers";

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
    await waitUntilBootPhase(page, "ready");
    await waitUntilSettled(page);
    await expect(page.locator("body")).not.toContainText("初期化に失敗");
  }

  expect(failed, `failed requests:\n${failed.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("export smoke (prod): 2タブ目は1タブ目を閉じるまで待ち、閉じたら自動で開く", async ({
  page: firstTab,
  context,
}) => {
  await firstTab.goto("/", { waitUntil: "networkidle" });
  await waitUntilBootPhase(firstTab, "ready");

  const secondTab = await context.newPage();
  await secondTab.goto("/", { waitUntil: "networkidle" });
  await waitUntilBootPhase(secondTab, "waiting-for-another-tab");
  await expect(secondTab.getByRole("status")).toContainText("別のタブで開いています");

  await firstTab.close();
  await waitUntilBootPhase(secondTab, "ready");
  await expect(secondTab.locator("body")).not.toContainText("別のタブで開いています");
  await expect(secondTab.locator("body")).not.toContainText("初期化に失敗");
});

test("export smoke (prod): 再読み込みしても同じタブを別のタブと取り違えない", async ({
  page,
}) => {
  await page.goto("/fiscal-periods", { waitUntil: "networkidle" });
  await waitUntilBootPhase(page, "ready");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.reload();
    await waitUntilBootPhase(page, "ready");
  }
  await expect(page.locator("body")).not.toContainText("初期化に失敗");
});
