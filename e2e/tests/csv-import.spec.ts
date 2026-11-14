import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  advanceToJournalizing,
  createFiscalPeriod,
  importEntriesFile,
  openJournalSheet,
} from "../helpers";

const CSV_FIXTURE = path.resolve("e2e/fixtures/csv-import-test.csv");
const JSON_FIXTURE = path.resolve("e2e/fixtures/dev-closing-entries.json");

test.describe("journal table import and export", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `インポート検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await page.getByRole("link", { name: "仕訳" }).click();
  });

  test("shows the whole period in one sheet and overwrites it from an edited CSV after confirming the counts", async ({
    page,
  }) => {
    await importEntriesFile(page, "csv", CSV_FIXTURE);
    const confirmation = overwriteConfirmation(page);
    await expect(confirmation).toContainText(
      "追加 3 件・変更 0 件・削除 0 件 (そのまま 0 件)",
    );
    await expect(confirmation).not.toContainText("ファイルにない仕訳");
    await expect(confirmation.getByRole("button")).toHaveText([
      "キャンセル",
      "上書きする",
    ]);
    await confirmation.getByRole("button", { name: "上書きする" }).click();
    await expect(
      page.getByText("上書きしました (追加 3・変更 0・削除 0)"),
    ).toBeVisible();
    const table = page.getByRole("table", { name: "仕訳のシート" });
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table).toContainText("CSVテスト売上");
    await expect(table).toContainText("CSVテスト家賃");

    const exported = await downloadCsv(page);
    expect(exported.split("\n")[0]).toBe(
      "\uFEFF仕訳番号,日付,借方科目,借方金額,貸方科目,貸方金額,摘要,取引先,税区分,事業区分,事業割合",
    );
    const edited = exported
      .replace(",8000,普通預金,8000,", ",9000,普通預金,9000,")
      .split("\n")
      .filter((line) => !line.includes("CSVテスト家賃"))
      .join("\n");

    await importEntriesFile(page, "csv", csvFile(edited));
    await expect(confirmation).toContainText(
      "追加 0 件・変更 1 件・削除 1 件 (そのまま 1 件)",
    );
    await expect(confirmation).toContainText("ファイルにない仕訳は消えます。");
    await confirmation.getByRole("button", { name: "キャンセル" }).click();
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table).toContainText("8,000");

    await importEntriesFile(page, "csv", csvFile(edited));
    await confirmation.getByRole("button", { name: "上書きする" }).click();
    await expect(
      page.getByText("上書きしました (追加 0・変更 1・削除 1)"),
    ).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table).toContainText("9,000");
    await expect(table).not.toContainText("CSVテスト家賃");

    await importEntriesFile(page, "csv", csvFile(await downloadCsv(page)));
    await expect(page.getByText("今の仕訳と同じです")).toBeVisible();
    await expect(confirmation).toHaveCount(0);
  });

  test("lists the rows it cannot read in a dialog without changing anything", async ({
    page,
  }) => {
    await importEntriesFile(
      page,
      "csv",
      csvFile(
        [
          "日付,借方科目,借方金額,貸方科目,貸方金額,摘要",
          "2026-05-01,消耗品,1000,普通預金,1000,文具",
          "2026-05-02,消耗品費,1000,普通預金,900,文具",
        ].join("\n"),
      ),
    );

    const problems = page.getByRole("alertdialog", {
      name: "CSV を取り込めません",
    });
    await expect(problems).toContainText(
      "読めない行があります。何も変えていません。",
    );
    await expect(problems.getByRole("listitem")).toHaveText([
      "2 行目借方: 勘定科目「消耗品」が見つかりません",
      "3 行目借方の合計 1,000 と貸方の合計 900 が合いません",
    ]);
    await expect(
      page.getByRole("table", { name: "仕訳のシート" }),
    ).toBeVisible();
    await problems.getByRole("button", { name: "閉じる" }).click();
    await expect(problems).toHaveCount(0);
    await expect(
      page.getByText("この期間の仕訳はまだありません"),
    ).toBeVisible();
  });

  test("adds legacy 事業主借 from a CSV in the previous format as equity, apart from 事業主貸", async ({
    page,
  }) => {
    await importEntriesFile(
      page,
      "csv",
      csvFile(
        [
          "localId,date,debit,debitType,debitAmount,credit,creditType,creditAmount,description,businessRate",
          "legacy-owner-loan,2026-05-01,現金,asset,30000,事業主借,liability,30000,旧分類の事業主借,100%",
        ].join("\n"),
      ),
    );
    await expect(
      page.getByText(
        "以前の形式の CSV なので、足すだけで取り込みました(取込 1 件 / 重複スキップ 0 件)",
      ),
    ).toBeVisible();
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

  test("imports entries from a deprecated JSON file with the keyboard", async ({
    page,
  }) => {
    await openJournalSheet(page);
    const fileButton = page.getByRole("button", {
      name: "ファイル",
      exact: true,
    });
    await fileButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: "CSV ファイルから (上書き)" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(fileButton).toBeFocused();

    await page.keyboard.press("Enter");
    const importItem = page.getByRole("menuitem", {
      name: "JSON ファイルから (非推奨・追加のみ)",
    });
    const fileChooserPromise = page.waitForEvent("filechooser");
    await importItem.press("Enter");
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(JSON_FIXTURE);

    await expect(page.getByText(/取り込みました\(取込 15 件/)).toBeVisible({
      timeout: 10_000,
    });
  });
});

function overwriteConfirmation(page: Page) {
  return page.getByRole("alertdialog", { name: "CSV で上書きしますか？" });
}

function csvFile(text: string) {
  return {
    name: "journal.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  };
}

async function downloadCsv(page: Page): Promise<string> {
  await page.getByRole("button", { name: "ファイル" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV でダウンロード" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_仕訳\.csv$/);
  return fs.readFileSync((await download.path())!, "utf8");
}
