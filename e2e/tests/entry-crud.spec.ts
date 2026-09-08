import { expect, test, type Locator, type Page } from "@playwright/test";
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
    await page
      .getByRole("button", { name: "最初の仕訳を作成" })
      .click();

    const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await expect(drawer).toBeVisible();

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
    await createEntryViaDrawer(page, {
      description: "編集前の摘要",
      amount: "10000",
    });

    await page.getByRole("button", { name: /編集前の摘要/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("摘要").fill("編集後の摘要");
    await clickButton(page, "保存");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByText("編集後の摘要")).toBeVisible();
    await expect(page.getByText("編集前の摘要")).not.toBeVisible();
  });

  test("validates a decimal business rate and preserves custom categories", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "追加" }).click();

    const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await drawer.getByLabel("摘要").fill("任意区分と小数割合");
    await drawer.locator(".bk-amount-input").first().fill("12000");
    await drawer.locator(".bk-amount-input").last().fill("12000");

    await setSuggestionValue(drawer, "事業割合 (%)", "abc");
    await clickButton(page, "作成");
    await expect(drawer).toContainText(
      "事業割合は0から100までの数値で入力してください。",
    );

    await setSuggestionValue(drawer, "事業割合 (%)", "33.5");
    await setSuggestionValue(drawer, "課税区分", "独自課税区分");
    await setSuggestionValue(drawer, "事業区分", "独自事業区分");
    await clickButton(page, "作成");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });

    await page
      .getByRole("button", { name: /任意区分と小数割合/ })
      .first()
      .click();
    const reopened = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(suggestionButton(reopened, "事業割合 (%)")).toHaveText(
      "33.5",
    );
    await expect(suggestionButton(reopened, "課税区分")).toHaveText(
      "独自課税区分",
    );
    await expect(suggestionButton(reopened, "事業区分")).toHaveText(
      "独自事業区分",
    );
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

    await drawer.getByRole("button", { name: "削除", exact: true }).click();
    const confirmDialog = page.getByRole("dialog", { name: "仕訳の削除確認" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "削除", exact: true }).click();

    await expect(page.getByText("削除対象の仕訳")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("keeps focus and Escape within the topmost dialog", async ({ page }) => {
    await createEntryViaDrawer(page, {
      description: "モーダル操作対象",
      amount: "3000",
    });
    await page.getByRole("button", { name: /モーダル操作対象/ }).click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    const dateButton = drawer.getByRole("button", { name: "日付" });

    await dateButton.click();
    const dateDialog = page.getByRole("dialog", { name: "日付を選択" });
    await expect(dateDialog).toBeVisible();
    await expect(
      dateDialog.getByRole("button", { name: "キャンセル" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dateDialog).not.toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(dateButton).toBeFocused();

    await dateButton.click();
    await expect(dateDialog).toBeVisible();
    await dateDialog.locator("..").click({ position: { x: 4, y: 4 } });
    await expect(dateDialog).not.toBeVisible();
    await expect(dateButton).toBeFocused();

    const deleteButton = drawer.getByRole("button", {
      name: "削除",
      exact: true,
    });
    await deleteButton.click();
    const deleteDialog = page.getByRole("dialog", {
      name: "仕訳の削除確認",
    });
    const cancelButton = deleteDialog.getByRole("button", {
      name: "キャンセル",
    });
    const confirmButton = deleteDialog.getByRole("button", {
      name: "削除",
      exact: true,
    });
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirmButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteDialog).not.toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(deleteButton).toBeFocused();
  });

  test("restores focus when shell menus close with Escape", async ({ page }) => {
    const fiscalPeriodButton = page.getByRole("button", {
      name: /仕訳CRUD検証/,
    });
    await fiscalPeriodButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fiscalPeriodButton).toHaveAttribute("aria-expanded", "false");
    await expect(fiscalPeriodButton).toBeFocused();

    const accountButton = page.getByRole("button", {
      name: "アカウントメニュー",
    });
    await accountButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
    await expect(accountButton).toBeFocused();
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

  await drawer.getByLabel("摘要").fill(opts.description);
  await drawer.locator(".bk-amount-input").first().fill(opts.amount);
  await drawer.locator(".bk-amount-input").last().fill(opts.amount);

  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}

function suggestionRow(drawer: Locator, label: string) {
  return drawer.locator(".bk-step-row").filter({ hasText: label });
}

function suggestionButton(drawer: Locator, label: string) {
  return suggestionRow(drawer, label).getByRole("button").first();
}

async function setSuggestionValue(
  drawer: Locator,
  label: string,
  value: string,
) {
  const row = suggestionRow(drawer, label);
  await row.getByRole("button").first().click();
  await row.getByRole("dialog").getByRole("textbox").fill(value);
  await row.getByRole("button", { name: "この値で確定" }).click();
}
