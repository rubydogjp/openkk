import { expect, test } from "@playwright/test";
import { startWithNewBook } from "../helpers";

test("signs in with the embedded user and disables sign-out", async ({
  page,
}) => {
  await startWithNewBook(page);
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
