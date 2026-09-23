import { expect, test, type Page } from "@playwright/test";

import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  disablePrintBeforeFirstNavigation,
  expectStep,
  extractReportAmounts,
  goToMonth,
  readPrintedReport,
} from "../helpers";

const FIXTURE = "e2e/fixtures/business-rate-entries.json";
const SHOTS = "test-results/scenario-business-rate";

const BUSINESS_RENT = "10,000";
const REVENUE = "300,000";
const INCOME = "290,000";

test.describe("家事按分 → 締めフローの帳票一貫性", () => {
  test("仮帳票と確定帳票が按分後の同じ数字で一致し、元帳と財務諸表が突合する", async ({
    page,
  }) => {
    await disablePrintBeforeFirstNavigation(page);

    await createFiscalPeriod(page, "按分検証 2026年分");
    await advanceToJournalizing(page);

    await importEntries(page);

    await page.getByRole("link", { name: "仕訳" }).click();
    await goToMonth(page, "2026年12月");
    await expect(page.getByText("家事按分の振替").first()).toBeVisible();
    const transferRow = page.getByRole("button", {
      name: /家事按分の振替/,
    });
    await expect(transferRow).toContainText("事業主貸");
    await expect(transferRow).toContainText("地代家賃");
    await expect(transferRow).toContainText(BUSINESS_RENT);
    await shot(page, "01-entry-list-business-rate-transfer");

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "日々の仕訳");
    await clickButton(page, "仮締めを実行");
    await clickButton(page, "実行する");
    await clickButton(page, "実行する");
    await clickButton(page, "次の手順へ");
    await expectStep(page, "本締め");
    await expect(page.getByText("仮_財務諸表.pdf")).toBeVisible();
    await shot(page, "02-pre-closing-documents");

    const draftJournal = await readPrintedReport(page, "仮_仕訳帳.pdf");
    const draftLedger = await readPrintedReport(page, "仮_総勘定元帳.pdf");
    const draftStatements = await readPrintedReport(page, "仮_財務諸表.pdf");

    expect(draftJournal).toContain("家事按分の振替");
    expect(draftLedger).toContain("家事按分の振替");

    expect(draftStatements).toContain("事業主貸");
    expect(draftStatements).toContain(INCOME);
    expect(draftStatements).toContain(BUSINESS_RENT);

    expect(draftLedger).toContain("地代家賃");
    expect(draftLedger).toContain(BUSINESS_RENT);

    await clickButton(page, "本締めを実行");
    await clickButton(page, "実行する");
    await expect(page.getByText("財務諸表の概要")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(`¥${REVENUE}`).first()).toBeVisible();
    await expect(page.getByText(`¥${INCOME}`).first()).toBeVisible();
    await shot(page, "03-final-summary");

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "書類を受け取る");
    await shot(page, "04-final-documents");
    const finalStatements = await readPrintedReport(page, "財務諸表.pdf");

    expect(finalStatements).toContain("事業主貸");
    expect(finalStatements).toContain(INCOME);
    expect(finalStatements).toContain(BUSINESS_RENT);
    expect(extractReportAmounts(finalStatements)).toEqual(
      extractReportAmounts(draftStatements),
    );
  });
});

async function importEntries(page: Page) {
  await page.getByRole("link", { name: "仕訳" }).click();
  await page.getByRole("button", { name: "ファイル" }).click();
  await page
    .locator('input[type="file"][accept*=".json"]')
    .setInputFiles(FIXTURE);
  await expect(page.getByText(/取り込みました\(取込 2 件/)).toBeVisible();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
