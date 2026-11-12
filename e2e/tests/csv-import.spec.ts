import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  advanceToJournalizing,
  createFiscalPeriod,
  importEntriesFile,
  openJournalTable,
} from "../helpers";

const CSV_FIXTURE = path.resolve("e2e/fixtures/csv-import-test.csv");
const JSON_FIXTURE = path.resolve("e2e/fixtures/dev-closing-entries.json");

test.describe("journal table import and export", () => {
  test.beforeEach(async ({ page }) => {
    await createFiscalPeriod(page, `インポート検証 ${Date.now()}`);
    await advanceToJournalizing(page);
    await page.getByRole("link", { name: "仕訳" }).click();
  });

  test("shows the whole period in one table and replaces it from an edited CSV", async ({
    page,
  }) => {
    await importEntriesFile(page, "csv", CSV_FIXTURE);
    await expect(reviewBar(page)).toContainText(
      "追加 3 件・変更 0 件・削除 0 件",
    );
    await page.getByRole("button", { name: "反映する" }).click();
    await expect(page.getByText(/反映しました\(追加 3 件/)).toBeVisible();
    const table = page.getByRole("table", { name: "仕訳の表" });
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table).toContainText("CSVテスト売上");
    await expect(table).toContainText("CSVテスト家賃");

    const exported = await downloadCsv(page);
    expect(exported.split("\n")[0]).toBe(
      "﻿仕訳番号,日付,借方科目,借方金額,貸方科目,貸方金額,摘要,取引先,税区分,事業区分,事業割合",
    );
    const edited = exported
      .replace(",8000,普通預金,8000,", ",9000,普通預金,9000,")
      .split("\n")
      .filter((line) => !line.includes("CSVテスト家賃"))
      .join("\n");

    await importEntriesFile(page, "csv", csvFile(edited));
    await expect(reviewBar(page)).toContainText(
      "追加 0 件・変更 1 件・削除 1 件 (そのまま 1 件)",
    );
    await expect(
      table.getByRole("row").filter({ hasText: "変更" }),
    ).toContainText("9000");
    await expect(
      table.getByRole("row").filter({ hasText: "削除" }),
    ).toContainText("CSVテスト家賃");
    await page.getByRole("button", { name: "反映する" }).click();
    await expect(
      page.getByText(/反映しました\(追加 0 件 \/ 変更 1 件 \/ 削除 1 件\)/),
    ).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table).not.toContainText("CSVテスト家賃");

    await importEntriesFile(page, "csv", csvFile(await downloadCsv(page)));
    await expect(reviewBar(page)).toContainText("今の仕訳と同じです");
  });

  test("lists the rows it cannot read without changing anything", async ({
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

    const alert = page
      .getByRole("alert")
      .filter({ hasText: "取り込めない行があります" });
    await expect(alert).toContainText(
      "2 行目: 借方: 勘定科目「消耗品」が見つかりません",
    );
    await expect(alert).toContainText(
      "3 行目: 借方の合計 1,000 と貸方の合計 900 が合いません",
    );
    await alert.getByRole("button", { name: "閉じる" }).click();
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
    await openJournalTable(page);
    const fileButton = page.getByRole("button", { name: "ファイル" });
    await fileButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: "CSV ファイルから (置き換え)" }),
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

function reviewBar(page: Page) {
  return page.getByRole("status").filter({ hasText: "取り込んだ CSV" });
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
