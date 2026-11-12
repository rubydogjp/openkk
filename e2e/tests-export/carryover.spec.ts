import { expect, test } from "@playwright/test";
import { archivedPeriodZip, storedText } from "../archived-period";
import {
  clickButton,
  expectStep,
  gotoInApp,
  openFixedAssets,
  reloadInApp,
  startApp,
} from "../helpers";

test.beforeEach(async ({ page }) => {
  await startApp(page);
});

test("carries archived text into a persistent next period and keeps it when editing", async ({
  page,
}) => {
  await gotoInApp(page, "/fiscal-periods");
  await page.getByLabel("取り込むファイル").setInputFiles({
    name: "2026.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archivedPeriodZip()),
  });
  await expectStep(page, "次の期間へ");
  const reversal = page.getByRole("checkbox", { name: new RegExp(storedText) });
  await reversal.locator("..").click();
  await expect(reversal).toBeChecked();
  await clickButton(page, "次期を作成");
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "日々の仕訳");
  await reloadInApp(page);
  await expectStep(page, "日々の仕訳");

  await openFixedAssets(page);
  await page.getByText(storedText, { exact: true }).click();
  const asset = page.getByRole("dialog", { name: "固定資産の編集" });
  await expect(asset.getByLabel("名称")).toHaveValue(storedText);
  await asset.getByLabel("耐用年数 (年)").fill("5");
  await clickButton(page, "保存");
  await expect(asset).not.toBeVisible();
  await page.getByText(storedText, { exact: true }).click();
  await expect(asset.getByLabel("名称")).toHaveValue(storedText);
  await expect(asset.getByLabel("耐用年数 (年)")).toHaveValue("5");
  await asset.getByRole("button", { name: "キャンセル" }).click();

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "補助" })
    .click();
  await page
    .getByRole("button", { name: /再振替 一時的な調整に使う特別な仕訳データ/ })
    .click();
  await page
    .getByRole("button", { name: new RegExp(`再振替: ${storedText}`) })
    .first()
    .click();
  const journal = page.getByRole("dialog", { name: "仕訳の編集" });
  await expect(journal.getByLabel("摘要")).toHaveValue(`再振替: ${storedText}`);
  for (const amount of [
    journal.getByLabel("借方金額").first(),
    journal.getByLabel("貸方金額").last(),
  ]) {
    await amount.click();
    await amount.press("ControlOrMeta+A");
    await amount.pressSequentially("2000");
    await expect(amount).toHaveValue("2000");
  }
  await clickButton(page, "保存");
  await expect(journal).not.toBeVisible();
  await reloadInApp(page);
  await page
    .getByRole("button", { name: new RegExp(`再振替: ${storedText}`) })
    .first()
    .click();
  await expect(journal.getByLabel("摘要")).toHaveValue(`再振替: ${storedText}`);
  await expect(journal.getByLabel("借方金額").first()).toHaveValue("2,000");
});

test("overwrites an opened period's opening BS and fixed assets from a chosen source", async ({
  page,
}) => {
  await gotoInApp(page, "/fiscal-periods");
  await page.getByLabel("取り込むファイル").setInputFiles({
    name: "2026.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archivedPeriodZip()),
  });
  await expectStep(page, "次の期間へ");
  await page.getByText("期末のBS → 翌期首のBS").click();
  await page.getByText("固定資産データ").click();
  await clickButton(page, "次期を作成");
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");

  await clickButton(page, "前の期間から引き継ぐ");
  const panel = page.getByRole("region", { name: "前の期間から引き継ぐ" });
  await expect(panel.getByLabel("引き継ぎ元")).toHaveValue(/.+/);
  await panel.getByText("固定資産データ").click();
  await clickButton(page, "引き継いで上書き");
  await clickButton(page, "上書きする");

  await expectStep(page, "日々の仕訳");
  await page.locator('button[aria-label="期首のBSを入力"]').first().click();
  await expectStep(page, "期首のBSを入力");
  await expect(
    page.getByText("仮締めまでの間は、いつでも金額を編集したり"),
  ).toBeVisible();
  const liabilities = page.getByRole("region", { name: "負債・純資産の部" });
  await expect(liabilities.getByText("未払金", { exact: true })).toBeVisible();
  await expect(liabilities.getByText("1,000", { exact: true })).toBeVisible();

  await openFixedAssets(page);
  await expect(page.getByText(storedText, { exact: true })).toBeVisible();
});
