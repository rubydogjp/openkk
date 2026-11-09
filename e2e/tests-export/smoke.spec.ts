import { test, expect } from "@playwright/test";

import {
  gotoInApp,
  keepBooksInApp,
  reloadInApp,
  startWithNewBook,
  waitUntilBookSaved,
  waitUntilBootPhase,
  waitUntilSettled,
} from "../helpers";

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
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await startWithNewBook(page);

  for (const route of ROUTES) {
    await waitUntilBookSaved(page);
    await page.goto(route, { waitUntil: "networkidle" });
    if (route === "/install") {
      await expect(
        page.getByRole("heading", { name: "オープン会計をインストール" }),
      ).toBeVisible();
      continue;
    }
    await waitUntilBootPhase(page, "ready");
    await waitUntilSettled(page);
    await expect(page.locator("body")).not.toContainText("初期化に失敗");
  }

  expect(failed, `failed requests:\n${failed.join("\n")}`).toEqual([]);
  expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("export smoke (prod): 2タブ目では開いている帳簿を開かず、1タブ目を閉じると開ける", async ({
  page: firstTab,
  context,
}) => {
  await startWithNewBook(firstTab);

  const secondTab = await context.newPage();
  await keepBooksInApp(secondTab);
  await secondTab.goto("/", { waitUntil: "networkidle" });
  await expect(
    secondTab
      .getByRole("alert")
      .filter({ hasText: "「帳簿.openkk」は別のタブで開いています" }),
  ).toBeVisible();
  await expect(secondTab.getByRole("region", { name: "帳簿" })).toContainText(
    "帳簿.openkk",
  );

  await firstTab.close();
  await secondTab
    .getByRole("region", { name: "帳簿" })
    .getByRole("button", { name: "帳簿.openkk" })
    .first()
    .click();
  await waitUntilBootPhase(secondTab, "ready");
  await expect(secondTab.locator("body")).not.toContainText(
    "別のタブで開いています",
  );
});

test("export smoke (prod): 再読み込みしても同じタブを別のタブと取り違えない", async ({
  page,
}) => {
  await startWithNewBook(page);
  await gotoInApp(page, "/fiscal-periods");
  await waitUntilBootPhase(page, "ready");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await reloadInApp(page);
    await waitUntilBootPhase(page, "ready");
  }
  await expect(page.locator("body")).not.toContainText(
    "別のタブで開いています",
  );
});
