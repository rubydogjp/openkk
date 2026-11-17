import { expect, test } from "@playwright/test";
import {
  addFixedAsset,
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  openFixedAssets,
} from "../helpers";

test.describe("fixed asset CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `固定資産CRUD検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await openFixedAssets(page);
  });

  test("adds a fixed asset and it appears in the list", async ({ page }) => {
    await expect(page.getByText("まだ固定資産がありません")).toBeVisible();

    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "固定資産の追加" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("名称").fill("テスト用ノートPC");
    await drawer.getByLabel("取得日").fill("2026-04-01");
    await drawer.getByLabel("取得価額").fill("300000");
    await drawer.getByLabel("耐用年数 (年)").fill("4");
    await expect(drawer.getByLabel("勘定科目")).toHaveValue("工具器具備品");
    await drawer.getByLabel("勘定科目").selectOption("機械装置");
    await clickButton(page, "作成");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("テスト用ノートPC")).toBeVisible();
    await expect(page.getByText("償却中", { exact: true })).toBeVisible();
  });

  test("records a sale through the guide, shows it read-only, and takes it back", async ({
    page,
  }) => {
    await addFixedAsset(page, {
      name: "売る予定のカメラ",
      acquisitionDate: "2026-02-01",
      acquisitionCost: "240000",
      usefulLife: "4",
    });

    await page
      .getByRole("button", { name: "売る予定のカメラの売却・廃棄" })
      .click();
    const guide = page.getByRole("dialog", {
      name: "売る予定のカメラの売却・廃棄",
    });
    await expect(
      guide.getByRole("heading", { name: "どうしましたか？" }),
    ).toBeVisible();
    await guide.getByRole("button", { name: "売った" }).click();
    await expect(
      guide.getByRole("heading", { name: "いつ・いくらで売りましたか？" }),
    ).toBeVisible();
    await guide.getByLabel("売った日").fill("2027-01-01");
    await guide.getByLabel("売った金額 (円)").fill("100000");
    await guide.getByRole("button", { name: "次へ" }).click();
    await expect(guide).toContainText("処分日は会計期間内にしてください");
    await guide.getByLabel("売った日").fill("2026-08-31");
    await guide.getByRole("button", { name: "次へ" }).click();
    await guide.getByRole("button", { name: "個人の口座・財布" }).click();
    const preview = guide.getByRole("table", { name: "本締めで入る仕訳" });
    await expect(preview).toContainText("事業主貸");
    await expect(preview).toContainText("100,000");
    await guide.getByRole("button", { name: "戻る" }).click();
    await expect(
      guide.getByRole("heading", { name: "代金はどこに入りましたか？" }),
    ).toBeVisible();
    await guide.getByRole("button", { name: "現金" }).click();
    await expect(preview).toContainText("現金");
    await guide.getByRole("button", { name: "記録する" }).click();
    await expect(guide).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByText("売却済み", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "売る予定のカメラの売却・廃棄" }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: "売る予定のカメラを開く" }),
    ).toHaveCount(1);
    await page.getByText("売る予定のカメラ", { exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
    await expect(drawer.getByLabel("状態", { exact: true })).toHaveCount(0);
    await expect(drawer).toContainText("現金");
    await expect(drawer).toContainText("2026-08-31");
    await drawer.getByRole("button", { name: "売却・廃棄の取り消し" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "売却・廃棄の取り消し",
    });
    await expect(confirm).toContainText("償却中に戻します。");
    await confirm.getByRole("button", { name: "取り消す" }).click();
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("償却中", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "売る予定のカメラの売却・廃棄" }),
    ).toBeVisible();
  });

  test("does not leave a fixed asset behind when creation is cancelled", async ({
    page,
  }) => {
    await expect(page.getByText("まだ固定資産がありません")).toBeVisible();

    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "固定資産の追加" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("名称").fill("キャンセルされる固定資産");
    await drawer.getByRole("button", { name: "キャンセル" }).click();

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("まだ固定資産がありません")).toBeVisible();
    await expect(page.getByText("キャンセルされる固定資産")).not.toBeVisible();
  });

  test("asks before Escape throws away what was typed", async ({ page }) => {
    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "固定資産の追加" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "追加" }).click();
    await drawer.getByLabel("名称").fill("消える前の資産");
    await page.keyboard.press("Escape");
    const discard = page.getByRole("alertdialog", { name: "入力の破棄" });
    await expect(discard).toContainText("入力した内容は保存されません。");
    await discard.getByRole("button", { name: "キャンセル" }).click();
    await expect(drawer.getByLabel("名称")).toHaveValue("消える前の資産");
    await page.keyboard.press("Escape");
    await discard.getByRole("button", { name: "破棄する" }).click();
    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
  });

  test("edits an existing fixed asset and the change is reflected", async ({
    page,
  }) => {
    await addFixedAsset(page, {
      name: "編集前の資産名",
      acquisitionDate: "2026-04-01",
      acquisitionCost: "200000",
      usefulLife: "4",
    });

    await page.getByText("編集前の資産名").click();
    const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("名称").fill("編集後の資産名");
    await clickButton(page, "保存");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("編集後の資産名")).toBeVisible();
    await expect(page.getByText("編集前の資産名")).not.toBeVisible();
  });

  test("deletes an existing fixed asset and it disappears from the list", async ({
    page,
  }) => {
    await addFixedAsset(page, {
      name: "削除対象の固定資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: "180000",
      usefulLife: "4",
    });

    await expect(page.getByText("削除対象の固定資産")).toBeVisible();

    await page.getByText("削除対象の固定資産").click();
    const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "削除", exact: true }).click();
    const confirmDialog = page.getByRole("alertdialog", {
      name: "固定資産の削除",
    });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog
      .getByRole("button", { name: "削除する", exact: true })
      .click();

    await expect(page.getByText("削除対象の固定資産")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("まだ固定資産がありません")).toBeVisible();
  });
});
