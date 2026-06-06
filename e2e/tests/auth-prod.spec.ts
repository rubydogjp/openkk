import { expect, test } from "@playwright/test";

const PROD_URL = process.env["OPENKK_PROD_URL"];

test.describe("prod embedded user", () => {
  test.skip(!PROD_URL, "OPENKK_PROD_URL not set - skipping prod auth tests");

  test("auto signs in with the embedded user and cannot sign out", async ({
    page,
  }) => {
    await page.goto(PROD_URL!);

    // 組み込みユーザーで自動サインインするため、サインイン画面は表示されない。
    await expect(
      page.getByRole("heading", { name: "サインイン" }),
    ).not.toBeVisible({ timeout: 5_000 });

    // 期間未作成なので期間ピッカーへ遷移し、追加ボタンが見える。
    await expect(page).toHaveURL(/\/fiscal-periods/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "追加" })).toBeVisible();

    // 組み込みユーザーはサインアウト非活性。
    await page.getByRole("button", { name: "アカウントメニュー" }).click();
    await expect(
      page.getByRole("button", { name: "サインアウト" }),
    ).toBeDisabled();
  });
});
