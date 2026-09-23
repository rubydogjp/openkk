import { expect, type Page } from "@playwright/test";

export async function createFiscalPeriod(page: Page, name: string) {
  await page.goto("/fiscal-periods");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("heading", { name: "新しい期間" })).toBeVisible();
  await page.getByPlaceholder("例: 2026年分").fill(name);
  await clickButton(page, "作成する");
  await expect(page).toHaveURL(/\/steps/);
}

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

export async function waitUntilSettled(page: Page) {
  await page.waitForSelector('html[data-openkk-busy="0"]', {
    timeout: 60_000,
  });
}

export async function clickButton(page: Page, name: string) {
  await waitUntilSettled(page);

  const dialog = page.getByRole("alertdialog");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name }).click();
    return;
  }
  await page.getByRole("button", { name }).last().click();
}

export async function disablePrintBeforeFirstNavigation(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

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

export function extractReportAmounts(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, " ");
  return (text.match(/\d{1,3}(?:,\d{3})+/g) ?? []).sort();
}
