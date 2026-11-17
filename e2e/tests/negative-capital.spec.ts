import { expect, test } from "@playwright/test";
import {
  clickButton,
  closeJournalSheet,
  expectStep,
  importEntriesFile,
  waitUntilSettled,
} from "../helpers";

test("carries a negative capital into the next period as △ on the 元入金 row and leaves 事業主貸 empty", async ({
  page,
}) => {
  await page.goto("/fiscal-periods");
  await expect(page.getByText("期間がありません")).toBeVisible();
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByPlaceholder("例: 2026年分").fill("赤字の 2026年分");
  await clickButton(page, "作成する");
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");

  await expectStep(page, "期首のBSを入力");
  await page.getByLabel("現金 金額", { exact: true }).fill("100000");
  await page.getByLabel("元入金 金額", { exact: true }).fill("100000");
  await clickButton(page, "保存して次へ");
  await expectStep(page, "日々の仕訳");

  await page.getByRole("link", { name: "仕訳" }).click();
  await importEntriesFile(page, "csv", {
    name: "loss.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "日付,借方科目,借方金額,貸方科目,貸方金額,摘要",
        "2026-05-01,通信費,250000,未払金,250000,赤字になる経費",
      ].join("\n"),
    ),
  });
  await page
    .getByRole("alertdialog", { name: "仕訳の追加" })
    .getByRole("button", { name: "足す" })
    .click();
  await expect(page.getByText("赤字になる経費")).toBeVisible();
  await closeJournalSheet(page);

  await page.getByRole("link", { name: "手順" }).click();
  await expectStep(page, "日々の仕訳");
  await clickButton(page, "仮締めを実行");
  await clickButton(page, "実行する");
  await clickButton(page, "期中に仮締めする");
  await waitUntilSettled(page);
  await page.getByRole("button", { name: "次の手順へ" }).click();
  await expectStep(page, "本締め");
  await clickButton(page, "本締めを実行");
  await clickButton(page, "実行する");
  await expect(page.getByText("財務諸表の概要")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: "手順" }).click();
  await expectStep(page, "書類を受け取る");
  await clickButton(page, "すべて受け取りました");

  await expectStep(page, "次の期間へ");
  await clickButton(page, "次の期間を作成");
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "日々の仕訳");
  await page.getByRole("button", { name: /^手順 \d+ 期首のBSを入力 / }).click();
  await expectStep(page, "期首のBSを入力");

  const liabilities = page.getByRole("region", {
    name: "負債・純資産の部",
    exact: true,
  });
  const assets = page.getByRole("region", { name: "資産の部", exact: true });
  await expect(liabilities).toContainText("△150,000");
  await expect(liabilities).toContainText("250,000");
  await expect(assets).toContainText("100,000");
  await expect(assets).not.toContainText("150,000");
});
