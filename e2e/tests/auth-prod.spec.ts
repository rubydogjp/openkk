import { expect, test } from "@playwright/test";

const PROD_URL = process.env["OPENKK_PROD_URL"];

test.describe("prod auth flow", () => {
  test.skip(!PROD_URL, "OPENKK_PROD_URL not set - skipping prod auth tests");

  test("completes local auth redirect and opens fiscal periods", async ({
    page,
  }) => {
    await page.goto(PROD_URL!);

    if (
      await page
        .getByRole("button", { name: "アカウントメニュー" })
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByRole("button", { name: "アカウントメニュー" }).click();
      await page.getByRole("button", { name: "サインアウト" }).click();
    }

    await expect(page.getByRole("heading", { name: "サインイン" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "サインイン" }).click();

    await expect(page).toHaveURL(/\/fiscal-periods/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "追加" })).toBeVisible();
  });
});
