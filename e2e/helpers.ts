import { expect, type Page } from "@playwright/test";

/** Creates a new fiscal period and returns to the steps page. */
export async function createFiscalPeriod(page: Page, name: string) {
  await page.goto("/fiscal-periods");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("heading", { name: "新しい期間" })).toBeVisible();
  await page.getByPlaceholder("例: 2026年分").fill(name);
  await clickButton(page, "作成する");
  await expect(page).toHaveURL(/\/steps/);
}

/**
 * Advances from the default "期間を開始" step all the way to the
 * "日々の仕訳" (journalizing) step with zero opening balances.
 */
export async function advanceToJournalizing(page: Page) {
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");

  await expectStep(page, "期首のBSを入力");
  await clickButton(page, "保存して次へ");
  await expectStep(page, "日々の仕訳");
}

export async function expectStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 15_000,
  });
}

export async function clickButton(page: Page, name: string) {
  const dialog = page.locator(".bk-dialog-card");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name }).click();
    return;
  }
  await page.getByRole("button", { name }).last().click();
}

/** Opens the entry drawer for a given row by clicking its row button. */
export async function openEntryRow(page: Page, rowPartialText: string) {
  await page
    .getByRole("button", { name: new RegExp(rowPartialText) })
    .first()
    .click();
}
