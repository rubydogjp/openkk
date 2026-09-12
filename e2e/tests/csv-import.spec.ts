import { expect, test } from "@playwright/test";
import path from "node:path";
import { advanceToJournalizing, createFiscalPeriod } from "../helpers";

const CSV_FIXTURE = path.resolve("e2e/fixtures/csv-import-test.csv");
const JSON_FIXTURE = path.resolve("e2e/fixtures/dev-closing-entries.json");

test.describe("file import", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `インポート検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await page.getByRole("link", { name: "仕訳" }).click();
  });

  test("imports entries from a CSV file and shows import count", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);

    await expect(page.getByText(/取り込みました\(取込 3 件/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("CSVテスト売上")).toBeVisible();
    await expect(page.getByText("CSVテストツール利用料")).toBeVisible();
  });

  test("imports entries from a JSON file and shows import count", async ({
    page,
  }) => {
    const fileButton = page.getByRole("button", { name: "ファイル" });
    await fileButton.focus();
    await page.keyboard.press("Enter");
    const importItem = page.getByRole("menuitem", {
      name: "JSON ファイルから",
    });
    await expect(importItem).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(fileButton).toBeFocused();

    await page.keyboard.press("Enter");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await importItem.press("Enter");
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(JSON_FIXTURE);

    await expect(page.getByText(/取り込みました\(取込 13 件/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("skips duplicate entries on re-import and reports skip count", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);
    await expect(page.getByText(/取り込みました\(取込 3 件/)).toBeVisible();

    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);
    await expect(
      page.getByText(/取り込みました\(取込 0 件 \/ 重複スキップ 3 件\)/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("exports entries as CSV and shows export confirmation", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);
    await expect(page.getByText(/取り込みました/)).toBeVisible();

    await page.getByRole("button", { name: "ファイル" }).click();
    await page.getByRole("menuitem", { name: "CSV でダウンロード" }).click();
    await expect(page.getByText(/_journal\.csv を出力しました/)).toBeVisible({
      timeout: 5_000,
    });
  });
});
