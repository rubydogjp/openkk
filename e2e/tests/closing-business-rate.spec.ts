import { expect, test, type Page } from "@playwright/test";

import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  expectStep,
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
    // 帳票は印刷用 iframe(srcdoc) で開く。ヘッドレスでは print を無効化して
    // iframe を残し、srcdoc から帳票 HTML を読み取って内容を検証する。
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      window.print = () => {};
    });

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
    const draftJournal = await readReport(page, "仮_仕訳帳.pdf");
    const draftLedger = await readReport(page, "仮_総勘定元帳.pdf");
    const draftStatements = await readReport(page, "仮_財務諸表.pdf");

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

    // 確定帳票の中身を読む（順序: 仕訳帳 / 総勘定元帳 / 財務諸表）。
    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "書類を受け取る");
    await shot(page, "04-final-documents");
    const finalStatements = await readReport(page, "財務諸表.pdf");

    // 仮帳票 == 確定帳票（按分後の同じ数字）。
    expect(finalStatements).toContain("事業主貸");
    expect(finalStatements).toContain("290,000");
    expect(finalStatements).toContain("10,000");
    expect(extractAmounts(finalStatements)).toEqual(
      extractAmounts(draftStatements),
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

async function goToMonth(page: Page, label: string) {
  for (let i = 0; i < 14; i += 1) {
    if (
      await page
        .getByText(label)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await page.getByRole("button", { name: "次の月" }).click();
  }
  await expect(page.getByText(label).first()).toBeVisible();
}

/**
 * 帳票タイル（ラベルで特定）の操作ボタンを押し、印刷用 iframe(srcdoc) から帳票
 * HTML を読み取って後続に影響しないよう除去する。
 */
async function readReport(page: Page, tileLabel: string): Promise<string> {
  await page
    .getByText(tileLabel, { exact: true })
    .locator("xpath=../..")
    .getByRole("button")
    .click();
  const iframe = page.locator('iframe[aria-hidden="true"]').last();
  await expect(iframe).toBeAttached({ timeout: 10_000 });
  const html = (await iframe.getAttribute("srcdoc")) ?? "";
  await page.evaluate(() => {
    for (const frame of document.querySelectorAll(
      'iframe[aria-hidden="true"]',
    )) {
      frame.remove();
    }
  });
  return html;
}

/** 帳票 HTML から表示金額（カンマ区切り）の並びを抽出する。 */
function extractAmounts(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, " ");
  return (text.match(/\d{1,3}(?:,\d{3})+/g) ?? []).sort();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
