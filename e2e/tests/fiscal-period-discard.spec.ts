import { expect, test } from "@playwright/test";
import { clickButton, createFiscalPeriod, expectStep } from "../helpers";

test("discards a fiscal period that has not started yet", async ({ page }) => {
  const name = `削除する期間 ${Date.now()}`;
  await createFiscalPeriod(page, name);
  await expectStep(page, "期間を開始");

  await clickButton(page, "この期間を削除");
  await clickButton(page, "削除する");

  await expect(page).toHaveURL(/\/fiscal-periods\/?$/);
  await expect(page.getByText(name)).toHaveCount(0);
});

test("does not offer discard once the fiscal period has started", async ({
  page,
}) => {
  await createFiscalPeriod(page, `開始済みの期間 ${Date.now()}`);
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");

  await page.locator('button[aria-label="期間を開始"]').first().click();
  await expectStep(page, "期間を開始");
  await expect(
    page.getByRole("button", { name: "この期間を削除" }),
  ).toHaveCount(0);
});
