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

    // 日付・勘定科目はボタン/ピッカー UI のため既定値を使う（このスモークでは
    // 取引が一覧に出ることを確認する。科目選択 UI の操作は別テストの責務）。
    await drawer.getByLabel("摘要").fill("手動入力テスト売上");
    await drawer.locator(".bk-amount-input").first().fill("50000");
    await drawer.locator(".bk-amount-input").last().fill("50000");

    await clickButton(page, "作成");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("手動入力テスト売上")).toBeVisible();
  });

  test("applies quick guide templates for additional income patterns", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "追加" }).click();

    const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "簡単入力ガイド" }).click();
    await drawer.getByRole("button", { name: "入金" }).click();
    await drawer.getByRole("button", { name: "その他の入金" }).click();
    await drawer.getByRole("button", { name: "前受金として受け取った" }).click();

    await expect(drawer.getByLabel("摘要")).toHaveValue("前受金の入金");
    await expect(drawer.getByLabel("借方科目")).toContainText("普通預金");
    await expect(drawer.getByLabel("貸方科目")).toContainText("前受金");

    await drawer.locator(".bk-amount-input").first().fill("120000");
    await drawer.locator(".bk-amount-input").last().fill("120000");
    await clickButton(page, "作成");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("前受金の入金")).toBeVisible();
    await expect(page.getByText("前受金").first()).toBeVisible();
  });

  test("edits an entry and the change is reflected in the list", async ({
    page,
  }) => {
    // create an entry first
    await createEntryViaDrawer(page, {
      description: "編集前の摘要",
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
      description: "削除対象の仕訳",
      amount: "3000",
    });

    await expect(page.getByText("削除対象の仕訳")).toBeVisible();

    await page.getByRole("button", { name: /削除対象の仕訳/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    // exact: true で footer の「削除」のみを対象に（行削除「この行を削除」と区別）
    await drawer.getByRole("button", { name: "削除", exact: true }).click();
    const confirmDialog = page.getByRole("dialog", { name: "仕訳の削除確認" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "削除", exact: true }).click();

    await expect(page.getByText("削除対象の仕訳")).not.toBeVisible({
      timeout: 5_000,
    });
  });
});

async function createEntryViaDrawer(
  page: Page,
  opts: {
    description: string;
    amount: string;
  },
) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await expect(drawer).toBeVisible();

  // 日付・勘定科目は既定値を使う（ボタン/ピッカー UI のため）。
  await drawer.getByLabel("摘要").fill(opts.description);
  await drawer.locator(".bk-amount-input").first().fill(opts.amount);
  await drawer.locator(".bk-amount-input").last().fill(opts.amount);

  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
