import { expect, test, type Page } from "@playwright/test";
import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
} from "../helpers";

test.describe("opening carryover (再振替)", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `再振替検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await navigateToCarryover(page);
  });

  test("adds a carryover record and it appears as a virtual entry", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "再振替" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("日付").fill("2026-01-01");
    await drawer.getByLabel("摘要").fill("再振替テスト: 未払費用");
    await drawer.getByLabel("借方科目").fill("未払金");
    await drawer.getByLabel("貸方科目").fill("地代家賃");
    await drawer.locator(".bk-amount-input").first().fill("30000");
    await drawer.locator(".bk-amount-input").last().fill("30000");
    await clickButton(page, "保存");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("再振替テスト: 未払費用")).toBeVisible();
  });

  test("edits a carryover record and the change is reflected", async ({
    page,
  }) => {
    await addCarryover(page, "編集前の再振替", "20000");

    await page.getByRole("button", { name: /編集前の再振替/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("摘要").fill("編集後の再振替");
    await clickButton(page, "保存");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByText("編集後の再振替")).toBeVisible();
    await expect(page.getByText("編集前の再振替")).not.toBeVisible();
  });

  test("deletes a carryover record and it disappears from the list", async ({
    page,
  }) => {
    await addCarryover(page, "削除対象の再振替", "15000");
    await expect(page.getByText("削除対象の再振替")).toBeVisible();

    await page
      .getByRole("button", { name: /削除対象の再振替/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "削除" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "仕訳の削除確認" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "削除" }).click();

    await expect(page.getByText("削除対象の再振替")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("carryover records appear as virtual rows in the entry list", async ({
    page,
  }) => {
    await addCarryover(page, "仕訳一覧確認用の再振替", "50000");

    // navigate to the entries page and verify the virtual row is visible in January
    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page.getByText("仕訳一覧確認用の再振替")).toBeVisible();

    // virtual rows show the "再振替" badge
    await expect(page.getByText("再振替")).toBeVisible();
  });
});

async function navigateToCarryover(page: Page) {
  await page.getByRole("link", { name: "補助" }).click();
  await expect(page.getByRole("heading", { name: "補助" })).toBeVisible();
  await page
    .getByRole("button", { name: /再振替 翌期に再振替が必要な仕訳/ })
    .click();
}

async function addCarryover(page: Page, description: string, amount: string) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("日付").fill("2026-01-01");
  await drawer.getByLabel("摘要").fill(description);
  await drawer.getByLabel("借方科目").fill("売掛金");
  await drawer.getByLabel("貸方科目").fill("売上");
  await drawer.locator(".bk-amount-input").first().fill(amount);
  await drawer.locator(".bk-amount-input").last().fill(amount);
  await clickButton(page, "保存");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
