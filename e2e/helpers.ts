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

export async function waitUntilBootPhase(
  page: Page,
  phase: "starting" | "waiting-for-another-tab" | "ready" | "failed",
) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-openkk-boot",
    phase,
    {
      timeout: 30_000,
    },
  );
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

export async function openFixedAssets(page: Page) {
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "補助" })
    .click();
  await page
    .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
    .click();
}

export async function addFixedAsset(
  page: Page,
  input: {
    name: string;
    acquisitionDate: string;
    acquisitionCost: string;
    usefulLife: string;
  },
) {
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "固定資産の追加" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("名称").fill(input.name);
  await drawer.getByLabel("取得日").fill(input.acquisitionDate);
  await drawer.getByLabel("取得価額").fill(input.acquisitionCost);
  await drawer.getByLabel("耐用年数 (年)").fill(input.usefulLife);
  await clickButton(page, "保存");
  await expect(drawer).not.toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(input.name)).toBeVisible();
}

export async function importEntriesFile(
  page: Page,
  kind: "json" | "csv",
  file: Parameters<Page["setInputFiles"]>[1],
) {
  await page.getByRole("button", { name: "ファイル" }).click();
  await page
    .locator(`input[type="file"][accept*=".${kind}"]`)
    .setInputFiles(file);
}

export async function saveScreenshot(
  page: Page,
  directory: string,
  name: string,
) {
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

export async function disablePrintBeforeFirstNavigation(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

export async function goToMonth(page: Page, label: string) {
  const target = page.getByText(label).first();
  const previousMonthButton = page.getByRole("button", { name: "前の月" });
  const nextMonthButton = page.getByRole("button", { name: "次の月" });
  const monthSwitcher = previousMonthButton.locator("..");
  for (const monthButton of [previousMonthButton, nextMonthButton]) {
    for (let i = 0; i < 24; i += 1) {
      if (await target.isVisible().catch(() => false)) return;
      if (await monthButton.isDisabled().catch(() => true)) break;
      const shownMonth = await monthSwitcher.innerText();
      await monthButton.click();
      await expect(monthSwitcher).not.toHaveText(shownMonth);
    }
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
