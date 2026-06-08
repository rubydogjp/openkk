import { expect, type Page } from "@playwright/test";

/** Creates a new fiscal period and returns to the steps page. */
export async function createFiscalPeriod(page: Page, name: string) {
  await page.goto("/fiscal-periods");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("heading", { name: "新しい期間" })).toBeVisible();
  await page.getByPlaceholder("例: 2026年分").fill(name);
  await clickButton(page, "作成する");
  await expect(page).toHaveURL(/\/steps/);
}

/**
 * Advances from the default "期間を開始" step all the way to the
 * "日々の仕訳" (journalizing) step with zero opening balances.
 */
export async function advanceToJournalizing(page: Page) {
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");

  await expectStep(page, "期首のBSを入力");
  await clickButton(page, "保存して次へ");
  await expectStep(page, "日々の仕訳");
}

export async function expectStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 15_000,
  });
}

export async function clickButton(page: Page, name: string) {
  const dialog = page.locator(".bk-dialog-card");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name }).click();
    return;
  }
  await page.getByRole("button", { name }).last().click();
}

/** Opens the entry drawer for a given row by clicking its row button. */
export async function openEntryRow(page: Page, rowPartialText: string) {
  await page
    .getByRole("button", { name: new RegExp(rowPartialText) })
    .first()
    .click();
}

/**
 * 帳票は印刷用 iframe(srcdoc) で開く。ヘッドレスでは print を無効化して iframe を
 * 残し、srcdoc から帳票 HTML を読めるようにする。最初のナビゲーション前に呼ぶこと。
 */
export async function disablePrint(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

/**
 * 仕訳一覧で目的の月ラベルへ移動する。開始位置に依存しないよう、最古月まで巻き戻して
 * から前進する（dev は期末月で開くため前進のみだと過去月に戻れない）。
 */
export async function goToMonth(page: Page, label: string) {
  const target = page.getByText(label).first();
  const prev = page.getByRole("button", { name: "前の月" });
  const next = page.getByRole("button", { name: "次の月" });
  for (let i = 0; i < 24; i += 1) {
    if (await target.isVisible().catch(() => false)) return;
    if (await prev.isDisabled().catch(() => true)) break;
    await prev.click();
  }
  for (let i = 0; i < 24; i += 1) {
    if (await target.isVisible().catch(() => false)) return;
    if (await next.isDisabled().catch(() => true)) break;
    await next.click();
  }
  await expect(target).toBeVisible();
}

/**
 * 帳票タイル（ラベルで特定）の操作ボタンを押し、印刷用 iframe(srcdoc) から帳票
 * HTML を読み取って後続に影響しないよう除去する。`disablePrint` を先に呼ぶこと。
 */
export async function readPrintedReport(
  page: Page,
  tileLabel: string,
): Promise<string> {
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
export function extractReportAmounts(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, " ");
  return (text.match(/\d{1,3}(?:,\d{3})+/g) ?? []).sort();
}
