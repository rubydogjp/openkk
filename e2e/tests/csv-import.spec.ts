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

  test("imports legacy 事業主借 as equity and groups it separately from 事業主貸", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "ファイル" }).click();
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
      name: "legacy-owner-loan.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "localId,date,debit,debitType,debitAmount,credit,creditType,creditAmount,description,businessRate",
          "legacy-owner-loan,2026-05-01,現金,asset,30000,事業主借,liability,30000,旧分類の事業主借,100%",
        ].join("\n"),
      ),
    });
    await expect(page.getByText(/取り込みました\(取込 1 件/)).toBeVisible();
    await page.getByText("旧分類の事業主借", { exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "仕訳の編集" });
    await expect(drawer.getByLabel("貸方科目")).toContainText("事業主借");
    await drawer.getByLabel("貸方科目").click();
    const picker = page.getByRole("dialog", { name: "勘定科目を選択" });
    await picker.getByPlaceholder("勘定科目を検索").fill("事業主");
    const loanGroup = picker
      .getByRole("button", { name: "事業主借", exact: true })
      .locator("..");
    await expect(loanGroup.getByText("純資産", { exact: true })).toBeVisible();
    const withdrawalGroup = picker
      .getByRole("button", { name: "事業主貸", exact: true })
      .locator("..");
    await expect(
      withdrawalGroup.getByText("資産", { exact: true }),
    ).toBeVisible();
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

    await expect(page.getByText(/取り込みました\(取込 15 件/)).toBeVisible({
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
