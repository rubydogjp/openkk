import { expect, test } from "@playwright/test";

test("signs in with the embedded user and disables sign-out", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fiscal-periods/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "サインイン" }),
  ).not.toBeVisible();
  await expect(page.getByRole("button", { name: "追加" })).toBeVisible();
  await page.getByRole("button", { name: "アカウントメニュー" }).click();
  await expect(
    page.getByRole("menuitem", { name: "サインアウト" }),
  ).toBeDisabled();
});
