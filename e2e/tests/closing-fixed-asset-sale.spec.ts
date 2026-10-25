import { expect, test, type Page } from "@playwright/test";

import {
  addFixedAsset,
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  disablePrintBeforeFirstNavigation,
  expectStep,
  extractReportAmounts,
  goToMonth,
  openFixedAssets,
  readPrintedReport,
  saveScreenshot,
} from "../helpers";

const SHOTS = "test-results/scenario-fixed-asset-sale";

const DEPRECIATION_AND_SALE_GAIN = "119,999";
const SALE_PRICE = "1,200,000";
const BOOK_VALUE_AT_DISPOSAL = "1,080,001";

test.describe("固定資産の売却 → 締めフローの帳票一貫性", () => {
  test("売却の減価償却・売却益が仮帳票と確定帳票で一致して計上される", async ({
    page,
  }) => {
    await disablePrintBeforeFirstNavigation(page);

    await createFiscalPeriod(page, "固定資産売却検証 2026年分");
    await advanceToJournalizing(page);

    await openFixedAssets(page);
    await addFixedAsset(page, {
      name: "売却検証サーバー",
      acquisitionDate: "2026-01-01",
      acquisitionCost: "1200000",
      usefulLife: "5",
    });
    await sellFixedAsset(page, "売却検証サーバー", {
      disposalDate: "2026-06-30",
      disposalPrice: "1200000",
    });

    await page.getByRole("link", { name: "仕訳" }).click();
    await goToMonth(page, "2026年6月");
    await expect(
      page.getByText("売却検証サーバーの売却").first(),
    ).toBeVisible();
    await expect(page.getByText("固定資産売却益").first()).toBeVisible();
    await saveScreenshot(page, SHOTS, "01-entry-list-sale");

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "日々の仕訳");
    await clickButton(page, "仮締めを実行");
    await clickButton(page, "実行する");
    await clickButton(page, "実行する");
    await clickButton(page, "次の手順へ");
    await expectStep(page, "本締め");
    await saveScreenshot(page, SHOTS, "02-pre-closing-documents");

    const draftJournal = await readPrintedReport(page, "仮_仕訳帳.pdf");
    expect(draftJournal).toContain("売却検証サーバーの売却");
    expect(draftJournal).toContain("売却検証サーバーの減価償却");
    expect(draftJournal).toContain("固定資産売却益");
    expect(draftJournal).toContain(DEPRECIATION_AND_SALE_GAIN);
    expect(draftJournal).toContain(SALE_PRICE);
    expect(draftJournal).toContain(BOOK_VALUE_AT_DISPOSAL);

    await clickButton(page, "本締めを実行");
    await clickButton(page, "実行する");
    await expect(page.getByText("財務諸表の概要")).toBeVisible({
      timeout: 30_000,
    });
    await saveScreenshot(page, SHOTS, "03-final-summary");

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "書類を受け取る");
    await saveScreenshot(page, SHOTS, "04-final-documents");

    const finalJournal = await readPrintedReport(page, "仕訳帳.pdf");
    expect(finalJournal).toContain("売却検証サーバーの売却");
    expect(finalJournal).toContain("固定資産売却益");
    expect(extractReportAmounts(finalJournal)).toEqual(
      extractReportAmounts(draftJournal),
    );
  });
});

async function sellFixedAsset(
  page: Page,
  name: string,
  input: { disposalDate: string; disposalPrice: string },
) {
  await page.getByText(name).click();
  const drawer = page.getByRole("dialog", { name: "固定資産の編集" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("状態").selectOption("売却済");
  await drawer.getByLabel("処分日").fill(input.disposalDate);
  await drawer.getByLabel("売却額").fill(input.disposalPrice);
  await clickButton(page, "保存");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
