import { expect, test } from "@playwright/test";
import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
} from "../helpers";

test.describe("fixed asset CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `固定資産CRUD検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await page.getByRole("link", { name: "補助" }).click();
    await page
      .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
      .click();
  });

  test("adds a fixed asset and it appears in the list", async ({ page }) => {
    await expect(page.getByText("まだ固定資産がありません")).toBeVisible();

    await page.getByRole("button", { name: "追加" }).click();
    const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("名称").fill("テスト用ノートPC");
    await drawer.getByLabel("取得日").fill("2026-04-01");
    await drawer.getByLabel("取得価額").fill("300000");
    await drawer.getByLabel("耐用年数 (年)").fill("4");
    await clickButton(page, "保存");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("テスト用ノートPC")).toBeVisible();
  });

  test("edits an existing fixed asset and the change is reflected", async ({
    page,
  }) => {
    // add an asset first
    await addFixedAsset(page, "編集前の資産名", "200000");

    await page.getByText("編集前の資産名").click();
    const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("名称").fill("編集後の資産名");
    await clickButton(page, "保存");

    await expect(drawer).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("編集後の資産名")).toBeVisible();
    await expect(page.getByText("編集前の資産名")).not.toBeVisible();
  });
});

async function addFixedAsset(
  page: Parameters<typeof clickButton>[0],
  name: string,
  acquisition: string,
) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("名称").fill(name);
  await drawer.getByLabel("取得日").fill("2026-04-01");
  await drawer.getByLabel("取得価額").fill(acquisition);
  await drawer.getByLabel("耐用年数 (年)").fill("4");
  await clickButton(page, "保存");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
