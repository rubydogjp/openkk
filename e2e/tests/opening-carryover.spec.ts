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
    await expect(page.getByRole("button", { name: "追加" })).toBeVisible();

    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await expect(drawer).toBeVisible();

    // 追加時に既定の勘定科目・日付が入った再振替が生成される。日付・科目は
    // ボタン/ピッカー UI のため既定値を使い、摘要と金額だけ編集する。
    await drawer.getByLabel("摘要").fill("再振替テスト: 未払費用");
    await drawer.getByLabel("借方金額").first().fill("30000");
    await drawer.getByLabel("貸方金額").last().fill("30000");
    await clickButton(page, "作成");

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

  test("preserves every line of a compound carryover when reopened", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "追加" }).click();
    const createDrawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
    await createDrawer.getByLabel("摘要").fill("複合再振替の往復検証");
    await createDrawer
      .getByRole("button", { name: "複合仕訳を追加" })
      .click();

    const createAmountsDebit = createDrawer.getByLabel("借方金額");
    const createAmountsCredit = createDrawer.getByLabel("貸方金額");
    await expect(createAmountsDebit).toHaveCount(2);
    await expect(createAmountsCredit).toHaveCount(2);
    await createAmountsDebit.nth(0).fill("30000");
    await createAmountsCredit.nth(0).fill("10000");
    await createAmountsDebit.nth(1).fill("20000");
    await createAmountsCredit.nth(1).fill("40000");
    await clickButton(page, "作成");
    await expect(createDrawer).not.toBeVisible({ timeout: 5_000 });

    await page
      .getByRole("button", { name: /複合再振替の往復検証/ })
      .first()
      .click();
    const editDrawer = page.getByRole("dialog", { name: "仕訳の編集" });
    const editAmountsDebit = editDrawer.getByLabel("借方金額");
    const editAmountsCredit = editDrawer.getByLabel("貸方金額");
    await expect(editAmountsDebit).toHaveCount(2);
    await expect(editAmountsCredit).toHaveCount(2);
    await expect(editAmountsDebit.nth(0)).toHaveValue("30,000");
    await expect(editAmountsCredit.nth(0)).toHaveValue("10,000");
    await expect(editAmountsDebit.nth(1)).toHaveValue("20,000");
    await expect(editAmountsCredit.nth(1)).toHaveValue("40,000");
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

    // exact: true で footer の「削除」のみを対象に（行削除「この行を削除」と区別）
    await drawer.getByRole("button", { name: "削除", exact: true }).click();
    const confirmDialog = page.getByRole("dialog", { name: "仕訳の削除確認" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "削除", exact: true }).click();

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
    // 再振替（仮想行）は期首=2026年1月に表示される。既定表示月(9月)から戻る。
    for (let i = 0; i < 8; i += 1) {
      await page.getByRole("button", { name: "前の月" }).click();
    }
    await expect(page.getByText("2026年1月")).toBeVisible();
    await expect(page.getByText("仕訳一覧確認用の再振替")).toBeVisible();

    // virtual rows show the "再振替" badge
    await expect(page.getByText("再振替").first()).toBeVisible();
  });
});

async function navigateToCarryover(page: Page) {
  await page.getByRole("link", { name: "補助" }).click();
  await expect(page.getByRole("heading", { name: "補助" })).toBeVisible();
  await page
    .getByRole("button", { name: /再振替 一時的な調整に使う特別な仕訳データ/ })
    .click();
}

async function addCarryover(page: Page, description: string, amount: string) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await expect(drawer).toBeVisible();
  // 日付・勘定科目は既定値を使う（ボタン/ピッカー UI のため）。
  await drawer.getByLabel("摘要").fill(description);
  await drawer.getByLabel("借方金額").first().fill(amount);
  await drawer.getByLabel("貸方金額").last().fill(amount);
  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
