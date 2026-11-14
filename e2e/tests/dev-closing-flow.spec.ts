import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { archivedPeriodZip } from "../archived-period";
import {
  addFixedAsset,
  clickButton,
  expectStep,
  goToMonth,
  closeJournalSheet,
  importEntriesFile,
  openFixedAssets,
  waitUntilSettled,
} from "../helpers";

const YEAR_ENTRIES_FIXTURE = "e2e/fixtures/dev-closing-entries.json";
const BOOK_OWNER_USER_ID = "openkk-original-user";
const BOOK_2024 = {
  name: "2024年分",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
};
const tempDirs: string[] = [];

test.afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test.describe("openkk closing flow", () => {
  test("creates a period, imports entries, and completes closing", async ({
    page,
  }) => {
    await createDevFiscalPeriodFromZero(page);

    await expectStep(page, "期間を開始");
    await clickButton(page, "開始する");
    await clickButton(page, "開始する");

    await expectStep(page, "期首のBSを入力");
    await fillOpeningAmount(page, "現金", "100000");
    await fillOpeningAmount(page, "その他の預金", "150000");
    await fillOpeningAmount(page, "元入金", "250000");
    await clickButton(page, "保存して次へ");

    await expectStep(page, "日々の仕訳");
    await importYearEntries(page);
    await createFixedAssetDuringScenario(page);
    await expectAccountingScenarioRows(page);

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "日々の仕訳");
    await clickButton(page, "仮締めを実行");
    await clickButton(page, "実行する");
    await clickButton(page, "実行する");
    await expect(page.getByText("記録終了")).toBeVisible();
    await waitUntilSettled(page);
    await page.getByRole("button", { name: "次の手順へ" }).click();

    await expectStep(page, "本締め");
    await expect(page.getByText("仮_仕訳帳.pdf")).toBeVisible();
    await expect(page.getByText("仮_総勘定元帳.pdf")).toBeVisible();
    await expect(page.getByText("仮_財務諸表.pdf")).toBeVisible();
    await clickButton(page, "本締めを実行");
    await clickButton(page, "実行する");
    await expect(page.getByText("財務諸表の概要")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page.getByText("2026年9月")).toBeVisible();
    await goToMonth(page, "2026年12月");
    await expect(page.getByText("2026年12月")).toBeVisible();
    await expect(
      page.getByText("MacBook Pro 14インチ相当の減価償却"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /MacBook Pro 14インチ相当の減価償却/,
      }),
    ).not.toBeVisible();

    await page.getByRole("link", { name: "手順" }).click();
    await expectStep(page, "書類を受け取る");
    await expect(page.getByText("仕訳帳.pdf")).toBeVisible();
    await expect(page.getByText("総勘定元帳.pdf")).toBeVisible();
    await expect(page.getByText("財務諸表.pdf")).toBeVisible();
    await clickButton(page, "全て受け取りました");

    await expectStep(page, "次の期間へ");
    await expect(page.getByText("期末のBS → 翌期首のBS")).toBeVisible();
    await expect(page.getByText("期末の振替 → 翌期首の再振替")).toBeVisible();
    await expect(page.getByText("固定資産データ")).toBeVisible();
    await expect(page.getByText("次期を作成")).toBeVisible();

    await page.locator('button[aria-label="本締め"]').first().click();
    await expectStep(page, "本締め");
    await page.locator('button[aria-label="書類を受け取る"]').first().click();
    await expectStep(page, "書類を受け取る");
    await page.locator('button[aria-label="次の期間へ"]').first().click();
    await expectStep(page, "次の期間へ");

    const reversals = page.getByRole("checkbox", {
      name: /秋商材の仕入と配送費/,
    });
    await expect(reversals).toHaveCount(2);
    for (const candidate of await reversals.all()) {
      await expect(candidate).not.toBeChecked();
      await candidate.press("Space");
      await expect(candidate).toBeChecked();
    }
    await expect(
      page.getByRole("checkbox", { name: /支払済みの通信費/ }),
    ).not.toBeChecked();

    await clickButton(page, "次期を作成");
    await expectStep(page, "期間を開始");
    await clickButton(page, "開始する");
    await clickButton(page, "開始する");
    await expectStep(page, "日々の仕訳");

    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page.getByText("2027年1月")).toBeVisible();
    await expect(
      page.getByText(/再振替: 秋商材の仕入と配送費/).first(),
    ).toBeVisible();
    await expect(page.getByText("再振替").first()).toBeVisible();
    await expect(page.getByText(/再振替: 支払済みの通信費/)).toHaveCount(0);

    await openFixedAssets(page);
    await expect(
      page.getByText("検証用固定資産 長い名称のノートPC兼撮影機材"),
    ).toBeVisible();

    await openFiscalPeriodList(page);
    await page
      .getByRole("button", {
        name: /検証用 2026年分 長い名称 ABCDEFGHIJKLMNOPQRSTUVWXYZ/,
      })
      .click();
    await expectStep(page, "次の期間へ");
    const downloadPromise = page.waitForEvent("download");
    await clickButton(page, "バックアップをダウンロード");
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.openkk$/);
    await expectStep(page, "次の期間へ");
    await expect(page.getByText("バックアップしました")).toBeVisible();
    await expect(page.getByRole("button", { name: /圧縮保存/ })).toHaveCount(0);
    const [backup] = await readBookPeriods(backupPath!);
    expect(backup?.name).toContain("検証用 2026年分");
    expect(backup?.phase).toBe("post_closing");
    expect(backup?.entryCount).toBeGreaterThan(0);

    await openFiscalPeriodList(page);
    await expect(page.getByText("圧縮保存済み")).toHaveCount(0);
    await page.getByRole("button", { name: "ファイル" }).click();
    await page.getByRole("menuitem", { name: /ファイルを取り込む/ }).click();
    await page.getByLabel("取り込むファイル").setInputFiles(backupPath!);
    await expect(page.getByText(/期間が重なる会計期間/)).toBeVisible();
  });

  test("imports a saved book and an archive zip from an earlier version as new periods", async ({
    page,
  }) => {
    await page.goto("/fiscal-periods");
    await expect(page.getByText("期間がありません")).toBeVisible();

    await page.getByRole("button", { name: "ファイル" }).click();
    await page.getByRole("menuitem", { name: /ファイルを取り込む/ }).click();
    await page
      .getByLabel("取り込むファイル")
      .setInputFiles(await createBookFile("2024年分.openkk", BOOK_2024));
    await expectStep(page, "期間を開始");
    await openFiscalPeriodList(page);
    await expect(
      page.getByRole("button", { name: /2024-01-01/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "ファイル" }).click();
    await page.getByRole("menuitem", { name: /ファイルを取り込む/ }).click();
    await page.getByLabel("取り込むファイル").setInputFiles({
      name: "2026.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await archivedPeriodZip()),
    });
    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page).toHaveURL(/\/entries\/?/);
    await expect(
      page.getByRole("button", { name: "2026年", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("圧縮保存済み")).toHaveCount(0);
  });
});

async function createDevFiscalPeriodFromZero(page: Page) {
  await page.goto("/fiscal-periods");
  await expect(page.getByText("期間がありません")).toBeVisible();
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("heading", { name: "新しい期間" })).toBeVisible();
  await page
    .getByPlaceholder("例: 2026年分")
    .fill("検証用 2026年分 長い名称 ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  await clickButton(page, "作成する");
  await expect(page).toHaveURL(/\/steps/);
}

async function openFiscalPeriodList(page: Page) {
  await waitUntilSettled(page);
  const archivedPeriodListButton = page.getByRole("button", {
    name: "期間のリストへ",
  });
  if (await archivedPeriodListButton.isVisible().catch(() => false)) {
    await archivedPeriodListButton.click();
    await expect(
      page.getByRole("heading", { name: "期間の選択" }),
    ).toBeVisible();
    return;
  }
  const periodMenuButton = page
    .getByRole("button", { name: /年分|期間 未選択/ })
    .first();
  await periodMenuButton.click();
  await expect(periodMenuButton).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("menuitem", { name: "リストを開く" }).click();
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
}

async function importYearEntries(page: Page) {
  await page.getByRole("link", { name: "仕訳" }).click();
  await importEntriesFile(page, "json", YEAR_ENTRIES_FIXTURE);
  await expect(page.getByText(/取り込みました\(取込 15 件/)).toBeVisible();
  await closeJournalSheet(page);
}

async function fillOpeningAmount(
  page: Page,
  accountName: string,
  value: string,
) {
  await page.getByLabel(`${accountName} 金額`, { exact: true }).fill(value);
}

async function createFixedAssetDuringScenario(page: Page) {
  await openFixedAssets(page);
  await expect(page.getByText("まだ固定資産がありません")).toBeVisible();
  await addFixedAsset(page, {
    name: "検証用固定資産 長い名称のノートPC兼撮影機材",
    acquisitionDate: "2026-04-01",
    acquisitionCost: "420000",
    usefulLife: "4",
  });
}

async function expectAccountingScenarioRows(page: Page) {
  await page.getByRole("link", { name: "仕訳" }).click();
  await expect(page.getByText("2026年9月")).toBeVisible();
  await expect(page.getByText("秋商材の仕入と配送費").first()).toBeVisible();
  await expect(page.getByText("仕入", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("荷造運賃", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("未払金").first()).toBeVisible();
  await expect(page.getByText("168,000").first()).toBeVisible();
  await expect(page.getByText("42,000").first()).toBeVisible();

  await goToMonth(page, "2026年12月");
  await expect(page.getByText("2026年12月")).toBeVisible();
  const macbookDepreciationRow = page.getByRole("button", {
    name: /MacBook Pro 14インチ相当の減価償却/,
  });
  await expect(macbookDepreciationRow).toBeVisible();
  await expect(macbookDepreciationRow).toContainText("減価償却費");
  await expect(macbookDepreciationRow).toContainText("94,500");

  await openFixedAssets(page);
  await expect(
    page.getByText("検証用固定資産 長い名称のノートPC兼撮影機材"),
  ).toBeVisible();
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-sim-e2e-"));
  tempDirs.push(dir);
  return dir;
}

async function createBookFile(
  fileName: string,
  period: { name: string; startDate: string; endDate: string },
) {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const filePath = path.join(makeTempDir(), fileName);
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    await adapter.db.fiscalPeriods.create(BOOK_OWNER_USER_ID, period);
  } finally {
    adapter.close();
  }
  return filePath;
}

async function readBookPeriods(
  filePath: string,
): Promise<Array<{ name: string; phase: string; entryCount: number }>> {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    const periods = await adapter.db.fiscalPeriods.getAll(BOOK_OWNER_USER_ID);
    return await Promise.all(
      periods.map(async ({ id, name, phase }) => ({
        name,
        phase,
        entryCount: (await adapter.db.entries.getAll(id)).length,
      })),
    );
  } finally {
    adapter.close();
  }
}
