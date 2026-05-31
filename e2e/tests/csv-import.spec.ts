import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
} from "../helpers";

const CSV_FIXTURE = path.resolve("e2e/fixtures/csv-import-sample.csv");
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
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".json"]')
      .setInputFiles(JSON_FIXTURE);

    await expect(page.getByText(/取り込みました\(取込 13 件/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("skips duplicate entries on re-import and reports skip count", async ({
    page,
  }) => {
    // first import
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);
    await expect(page.getByText(/取り込みました\(取込 3 件/)).toBeVisible();

    // second import of the same file → all rows are duplicates
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
    // import some entries first
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .locator('input[type="file"][accept*=".csv"]')
      .setInputFiles(CSV_FIXTURE);
    await expect(page.getByText(/取り込みました/)).toBeVisible();

    // export as CSV
    await page.getByRole("button", { name: "ファイル" }).click();
    // click the CSV export menu item (not the file input, nor imported entry
    // rows whose descriptions also contain "CSV")
    await page.getByRole("menuitem", { name: "CSV でダウンロード" }).click();
    await expect(page.getByText(/_journal\.csv を出力しました/)).toBeVisible({
      timeout: 5_000,
    });
  });
});
