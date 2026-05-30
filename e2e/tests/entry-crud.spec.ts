import { expect, test, type Page } from "@playwright/test";
import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
} from "../helpers";

test.describe("entry CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `仕訳CRUD検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await page.getByRole("link", { name: "仕訳" }).click();
  });

  test("manually creates an entry and it appears in the list", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "追加" }).click();

    const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("日付").fill("2026-09-10");
    await drawer.getByLabel("摘要").fill("手動入力テスト売上");
    await drawer.getByLabel("借方科目").fill("普通預金");
    await drawer.getByLabel("貸方科目").fill("売上");
    await drawer.locator(".bk-amount-input").first().fill("50000");
    await drawer.locator(".bk-amount-input").last().fill("50000");

    await clickButton(page, "作成");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("手動入力テスト売上")).toBeVisible();
  });

  test("edits an entry and the change is reflected in the list", async ({
    page,
  }) => {
    // create an entry first
    await createEntryViaDrawer(page, {
      date: "2026-09-05",
      description: "編集前の摘要",
      debitAccount: "現金",
      creditAccount: "売上",
      amount: "10000",
    });

    // click the row to open edit drawer
    await page.getByRole("button", { name: /編集前の摘要/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("摘要").fill("編集後の摘要");
    await clickButton(page, "保存");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByText("編集後の摘要")).toBeVisible();
    await expect(page.getByText("編集前の摘要")).not.toBeVisible();
  });

  test("deletes an entry and it disappears from the list", async ({ page }) => {
    await createEntryViaDrawer(page, {
      date: "2026-09-08",
      description: "削除対象の仕訳",
      debitAccount: "通信費",
      creditAccount: "普通預金",
      amount: "3000",
    });

    await expect(page.getByText("削除対象の仕訳")).toBeVisible();

    await page.getByRole("button", { name: /削除対象の仕訳/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "削除" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "仕訳の削除確認" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "削除" }).click();

    await expect(page.getByText("削除対象の仕訳")).not.toBeVisible({
      timeout: 5_000,
    });
  });
});

async function createEntryViaDrawer(
  page: Page,
  opts: {
    date: string;
    description: string;
    debitAccount: string;
    creditAccount: string;
    amount: string;
  },
) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await expect(drawer).toBeVisible();

  await drawer.getByLabel("日付").fill(opts.date);
  await drawer.getByLabel("摘要").fill(opts.description);
  await drawer.getByLabel("借方科目").fill(opts.debitAccount);
  await drawer.getByLabel("貸方科目").fill(opts.creditAccount);
  await drawer.locator(".bk-amount-input").first().fill(opts.amount);
  await drawer.locator(".bk-amount-input").last().fill(opts.amount);

  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
