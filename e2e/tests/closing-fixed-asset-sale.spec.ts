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
  test("案内で売った資産の減価償却と、事業主借に入る帳簿価額との差が、仮帳票と確定帳票で一致して計上される", async ({
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
      proceedsTo: "事業用の口座 (普通預金)",
    });

    await page.getByRole("link", { name: "仕訳" }).click();
    await goToMonth(page, "2026年6月");
    await expect(
      page.getByText("売却検証サーバーの売却").first(),
    ).toBeVisible();
    await expect(page.getByText("事業主借").first()).toBeVisible();
    await expect(page.getByText("固定資産売却益")).toHaveCount(0);
    await saveScreenshot(page, SHOTS, "01-entry-list-sale");

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "日々の仕訳");
    await clickButton(page, "仮締めを実行");
    await clickButton(page, "実行する");
    await clickButton(page, "期中に仮締めする");
    await clickButton(page, "次の手順へ");
    await expectStep(page, "本締め");
    await saveScreenshot(page, SHOTS, "02-pre-closing-documents");

    const draftJournal = await readPrintedReport(page, "仮_仕訳帳.pdf");
    expect(draftJournal).toContain("売却検証サーバーの売却");
    expect(draftJournal).toContain("売却検証サーバーの減価償却");
    expect(draftJournal).toContain("事業主借");
    expect(draftJournal).not.toContain("固定資産売却益");
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
    expect(finalJournal).toContain("事業主借");
    expect(finalJournal).not.toContain("固定資産売却益");
    expect(extractReportAmounts(finalJournal)).toEqual(
      extractReportAmounts(draftJournal),
    );
  });
});

async function sellFixedAsset(
  page: Page,
  name: string,
  input: { disposalDate: string; disposalPrice: string; proceedsTo: string },
) {
  await page.getByRole("button", { name: `${name}の売却・廃棄` }).click();
  const drawer = page.getByRole("dialog", { name: `${name}の売却・廃棄` });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "売った" }).click();
  await drawer.getByLabel("売った日").fill(input.disposalDate);
  await drawer.getByLabel("売った金額 (円)").fill(input.disposalPrice);
  await drawer.getByRole("button", { name: "次へ" }).click();
  await drawer.getByRole("button", { name: input.proceedsTo }).click();
  await expect(
    drawer.getByRole("heading", { name: "本締めで入る仕訳" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "記録する" }).click();
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
}
