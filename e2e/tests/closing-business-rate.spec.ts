import { expect, test, type Page } from "@playwright/test";

import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  disablePrint,
  expectStep,
  extractReportAmounts,
  goToMonth,
  readPrintedReport,
} from "../helpers";

const FIXTURE = "e2e/fixtures/business-rate-entries.json";
const SHOTS = "test-results/scenario-business-rate";

// 家事按分（地代家賃 20,000 の 50%）と確定帳票の一貫性を実画面で検証する。
// - 仕訳一覧に「家事按分」の振替行が出る
// - 仮帳票（本締め前プレビュー）と確定帳票で同じ按分後の数字になる
// - 総勘定元帳が按分後の科目残高で財務諸表と突合する
test.describe("家事按分 → 締めフローの帳票一貫性", () => {
  test("仮帳票と確定帳票が按分後の同じ数字で一致し、元帳と財務諸表が突合する", async ({
    page,
  }) => {
    await disablePrint(page);

    await createFiscalPeriod(page, "按分検証 2026年分");
    await advanceToJournalizing(page);

    await importEntries(page);

    // --- 仕訳一覧: 期末月に「家事按分」の振替行が表示される ---
    await page.getByRole("link", { name: "仕訳" }).click();
    await goToMonth(page, "2026年12月");
    await expect(page.getByText("家事按分の振替").first()).toBeVisible();
    const transferRow = page.getByRole("button", {
      name: /家事按分の振替/,
    });
    await expect(transferRow).toContainText("事業主貸");
    await expect(transferRow).toContainText("地代家賃");
    await expect(transferRow).toContainText("10,000");
    await shot(page, "01-entry-list-business-rate-transfer");

    // --- 仮締め ---
    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "日々の仕訳");
    await clickButton(page, "仮締めを実行");
    await clickButton(page, "実行する");
    await clickButton(page, "実行する");
    await clickButton(page, "次の手順へ");
    await expectStep(page, "本締め");
    await expect(page.getByText("仮_財務諸表.pdf")).toBeVisible();
    await shot(page, "02-pre-closing-documents");

    // 仮帳票の中身を読む。
    const draftJournal = await readPrintedReport(page, "仮_仕訳帳.pdf");
    const draftLedger = await readPrintedReport(page, "仮_総勘定元帳.pdf");
    const draftStatements = await readPrintedReport(page, "仮_財務諸表.pdf");

    // 仕訳帳・元帳に家事按分の振替が現れる。
    expect(draftJournal).toContain("家事按分の振替");
    expect(draftLedger).toContain("家事按分の振替");

    // 財務諸表: 按分後の地代家賃 10,000・事業主貸・所得 290,000。
    expect(draftStatements).toContain("事業主貸");
    expect(draftStatements).toContain("290,000");
    expect(draftStatements).toContain("10,000");

    // 元帳と財務諸表の突合: 元帳にも按分後の地代家賃残高 10,000 が出る
    // （生の 20,000 のままではない）。
    expect(draftLedger).toContain("地代家賃");
    expect(draftLedger).toContain("10,000");

    // --- 本締め ---
    await clickButton(page, "本締めを実行");
    await clickButton(page, "実行する");
    await expect(page.getByText("財務諸表の概要")).toBeVisible({
      timeout: 30_000,
    });
    // 概要図は確定帳票と同じ computeFsAggregate から描く。按分後の収益 300,000・
    // 利益 290,000 が図にも出る（確定 PDF の数字と一致）。
    await expect(page.getByText("¥300,000").first()).toBeVisible();
    await expect(page.getByText("¥290,000").first()).toBeVisible();
    await shot(page, "03-final-summary");

    // 確定帳票の中身を読む。
    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "書類を受け取る");
    await shot(page, "04-final-documents");
    const finalStatements = await readPrintedReport(page, "財務諸表.pdf");

    // 仮帳票 == 確定帳票（按分後の同じ数字）。
    expect(finalStatements).toContain("事業主貸");
    expect(finalStatements).toContain("290,000");
    expect(finalStatements).toContain("10,000");
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
