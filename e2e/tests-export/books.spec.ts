import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

import {
  clickButton,
  createFiscalPeriod,
  expectStep,
  gotoInApp,
  reloadInApp,
  startApp,
  waitUntilBootPhase,
  waitUntilBooksStored,
} from "../helpers";

const USER_ID = "openkk-original-user";
const DAY_MS = 24 * 60 * 60 * 1000;
const UNSAVED_STATUS = "バックアップしていない変更があります";
const SAME_MESSAGE = "今のデータと同じです。";
const OVERWRITE_TITLE = "ファイルでの上書き";
const KEPT_IN_BROWSER_MESSAGE = "データはこのブラウザの中だけにあります";
const CHANGED_OUTSIDE_MESSAGE =
  "ファイルを優先して、アプリの中の「2026年分」を上書きします。";
const UNSAVED_CHANGES_MESSAGE =
  "アプリの中の「2026年分」に、バックアップしていない変更があります。ファイルを優先して上書きすると失われます。";
const UNMOVED_NOTICE = "前の版から移せなかった会計期間が 1 件あります";
const UNREADABLE_NOTICE = "読み込めない会計期間が 1 件あります";
const LEGACY_SEED_PATH = "/__legacy-seed/";
const SQLITE_WASM_DIR = path.resolve("node_modules/@sqlite.org/sqlite-wasm");
const RELEASE_FIXTURE_DIR = path.resolve("test/legacy-fixtures/v26.3.1");
const LEGACY_SEED_WORKER = `
import sqlite3InitModule from "${LEGACY_SEED_PATH}sqlite-wasm/index.mjs";
self.onmessage = async (event) => {
  try {
    const sqlite3 = await sqlite3InitModule();
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "openkk" });
    new pool.OpfsSAHPoolDb("openkk.sqlite3").close();
    const [legacyName] = pool.getFileNames();
    pool.importDb(legacyName, event.data);
    pool.pauseVfs();
    self.postMessage({ ok: true, error: null });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
`;
const LEGACY_READ_WORKER = `
import sqlite3InitModule from "${LEGACY_SEED_PATH}sqlite-wasm/index.mjs";
self.onmessage = async () => {
  try {
    const sqlite3 = await sqlite3InitModule();
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "openkk" });
    const names = pool.getFileNames();
    const bytes = names.length === 1 ? pool.exportFile(names[0]) : null;
    pool.pauseVfs();
    self.postMessage({ ok: true, names, bytes, error: null });
  } catch (error) {
    self.postMessage({ ok: false, names: [], bytes: null, error: String(error) });
  }
};
`;
const LEGACY_WORKERS: Record<string, string> = {
  "worker.mjs": LEGACY_SEED_WORKER,
  "read-worker.mjs": LEGACY_READ_WORKER,
};

type PeriodInput = { name: string; startDate: string; endDate: string };

type FakeSavePicker = {
  opened: number;
  closesUnpicked: boolean;
  written: number[][];
};

type FakeSavePickerHost = {
  fakeSavePicker: FakeSavePicker;
  showSaveFilePicker: () => Promise<{
    createWritable(): Promise<{
      write(bytes: Uint8Array): Promise<void>;
      close(): Promise<void>;
      abort(): Promise<void>;
    }>;
  }>;
};

const tempDirs: string[] = [];

test.afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const year2026: PeriodInput = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

test("tells where the data is kept until the notice is closed", async ({
  page,
}) => {
  await page.goto("/");
  await waitUntilBootPhase(page, "ready");
  const notice = page
    .getByRole("status")
    .filter({ hasText: KEPT_IN_BROWSER_MESSAGE });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await waitUntilBootPhase(page, "ready");
  await expect(notice).toBeVisible();

  await notice.getByRole("button", { name: "閉じる" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await waitUntilBootPhase(page, "ready");
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("saves the current period to a file named after it and shows the save state", async ({
  page,
}) => {
  await startApp(page);
  await expect(saveButton(page)).toBeDisabled();
  await expect(saveStatus(page)).toHaveText("");
  await createFiscalPeriod(page, "2026年分");
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);

  const savedPath = await saveBook(page, "2026年分.openkk");

  await expect(saveStatus(page)).toHaveText(/^前回 \d{1,2}\/\d{1,2}$/);
  expect(await readBookPeriods(savedPath)).toEqual([
    { name: "2026年分", phase: "pre_opening" },
  ]);
  await reloadInApp(page);
  await expect(saveStatus(page)).toHaveText(/^前回 \d{1,2}\/\d{1,2}$/);

  await startOpenedPeriod(page);
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);
  expect(await countStoredBooks(page)).toBe(1);
});

test("leaves the period unsaved when the save picker is closed and marks it saved once the file is written", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const picker: FakeSavePicker = {
      opened: 0,
      closesUnpicked: true,
      written: [],
    };
    const host = window as unknown as FakeSavePickerHost;
    host.fakeSavePicker = picker;
    host.showSaveFilePicker = async () => {
      picker.opened += 1;
      if (picker.closesUnpicked) throw new DOMException("closed", "AbortError");
      return {
        createWritable: async () => ({
          write: async (bytes) => {
            picker.written.push(Array.from(bytes));
          },
          close: async () => {},
          abort: async () => {},
        }),
      };
    };
  });
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  await waitUntilBooksStored(page);

  await saveButton(page).click();
  await page.waitForFunction(
    () => (window as unknown as FakeSavePickerHost).fakeSavePicker.opened === 1,
  );
  await expect(saveButton(page)).toBeEnabled();
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);

  await page.evaluate(() => {
    (window as unknown as FakeSavePickerHost).fakeSavePicker.closesUnpicked =
      false;
  });
  await saveButton(page).click();

  await expect(saveStatus(page)).toHaveText(/^前回 \d{1,2}\/\d{1,2}$/);
  const written = await page.evaluate(
    () => (window as unknown as FakeSavePickerHost).fakeSavePicker.written,
  );
  expect(written).toHaveLength(1);
  expect(Buffer.from(written[0]!.slice(0, 15)).toString("utf8")).toBe(
    "SQLite format 3",
  );
});

test("keeps each period in its own book and removes the book with its period", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "残す期間");
  const otherPath = await createBookFile("other.openkk", [
    { name: "消す期間", startDate: "2090-01-01", endDate: "2090-12-31" },
  ]);
  await importBook(page, otherPath);
  await expectImported(page);
  await expectStep(page, "期間を開始");
  await waitUntilBooksStored(page);
  expect(await countStoredBooks(page)).toBe(2);

  await clickButton(page, "この期間を削除");
  await clickButton(page, "削除する");
  await expect(page).toHaveURL(/\/fiscal-periods\/?$/);
  await waitUntilBooksStored(page);

  expect(await countStoredBooks(page)).toBe(1);
  await reloadInApp(page);
  await expect(page.getByText("残す期間")).toBeVisible();
  await expect(page.getByText("消す期間")).toHaveCount(0);
});

test("does nothing when the saved file is taken in again unchanged", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const savedPath = await saveBook(page, "2026年分.openkk");

  await importBook(page, savedPath);

  await expect(
    page.getByRole("status").filter({ hasText: SAME_MESSAGE }),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("restores a saved file after asking, with only cancel and overwrite to choose", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const beforeStart = await saveBook(page, "2026年分.openkk");
  await startOpenedPeriod(page);
  const afterStart = await saveBook(page, "2026年分.openkk");
  await clickButton(page, "保存して次へ");
  await expectStep(page, "日々の仕訳");

  await importBook(page, beforeStart);
  const dialog = page.getByRole("alertdialog", { name: OVERWRITE_TITLE });
  await expect(dialog).toContainText(UNSAVED_CHANGES_MESSAGE);
  await expect(dialog.getByRole("button")).toHaveText([
    "キャンセル",
    "上書きする",
  ]);
  await dialog.getByRole("button", { name: "上書きする" }).click();

  await expectImported(page);
  await expectStep(page, "期間を開始");
  expect(await readBookPeriods(afterStart)).toEqual([
    { name: "2026年分", phase: "journalizing" },
  ]);
  expect(await countStoredBooks(page)).toBe(1);

  await importBook(page, afterStart);
  await expect(dialog).toContainText(CHANGED_OUTSIDE_MESSAGE);
  await dialog.getByRole("button", { name: "上書きする" }).click();
  await expectImported(page);
  await expectStep(page, "期首のBSを入力");
  await expect(saveStatus(page)).toHaveText(/^前回 /);
});

test("keeps the current data when the confirmation is cancelled", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const beforeStart = await saveBook(page, "2026年分.openkk");
  await startOpenedPeriod(page);

  await importBook(page, beforeStart);
  const dialog = page.getByRole("alertdialog", { name: OVERWRITE_TITLE });
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toHaveCount(0);

  await reloadInApp(page);
  await page.getByRole("button", { name: /^2026年分 / }).click();
  await expectStep(page, "期首のBSを入力");
});

test("takes in a book the CLI changed and tells where the changes were made", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const savedPath = await saveBook(page, "2026年分.openkk");
  await renamePeriodLikeCli(savedPath, "CLIで直した2026年分");

  await importBook(page, savedPath);
  const dialog = page.getByRole("alertdialog", { name: OVERWRITE_TITLE });
  await expect(dialog).toContainText(CHANGED_OUTSIDE_MESSAGE);
  await dialog.getByRole("button", { name: "キャンセル" }).click();

  await page.getByRole("button", { name: /^2026年分 / }).click();
  await startOpenedPeriod(page);
  await importBook(page, savedPath);
  await expect(dialog).toContainText(UNSAVED_CHANGES_MESSAGE);
  await dialog.getByRole("button", { name: "上書きする" }).click();

  await expectImported(page);
  await expectStep(page, "期間を開始");
  await gotoInApp(page, "/fiscal-periods");
  await expect(
    page.getByRole("button", { name: /^CLIで直した2026年分 / }),
  ).toBeVisible();
  expect(await countStoredBooks(page)).toBe(1);
});

test("adds a period from a file without asking", async ({ page }) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const otherPath = await createBookFile("2027.openkk", [
    { name: "2027年分", startDate: "2027-01-01", endDate: "2027-12-31" },
  ]);

  await importBook(page, otherPath);

  await expectImported(page);
  await expectStep(page, "期間を開始");
  await expect(saveStatus(page)).toHaveText(/^前回 /);
  await gotoInApp(page, "/fiscal-periods");
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2027年分 / })).toBeVisible();
  expect(await countStoredBooks(page)).toBe(2);
});

test("splits a file that holds several periods into one book each", async ({
  page,
}) => {
  await startApp(page);
  const bothPath = await createBookFile("both.openkk", [
    year2026,
    { name: "2027年分", startDate: "2027-01-01", endDate: "2027-12-31" },
  ]);

  await importBook(page, bothPath);

  await expectImported(page);
  await gotoInApp(page, "/fiscal-periods");
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2027年分 / })).toBeVisible();
  expect(await countStoredBooks(page)).toBe(2);
  await importBook(page, bothPath);
  await expect(
    page.getByRole("status").filter({ hasText: SAME_MESSAGE }),
  ).toBeVisible();
});

test("replaces a separately made book of the same dates after asking", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const otherPath = await createBookFile("other.openkk", [
    { ...year2026, name: "別に作った2026年分" },
  ]);

  await importBook(page, otherPath);
  const dialog = page.getByRole("alertdialog", { name: OVERWRITE_TITLE });
  await expect(dialog).toContainText(
    "アプリの中の「2026年分」とは別に作られた帳簿です。ファイルを優先して上書きすると、今の帳簿は失われます。",
  );
  await dialog.getByRole("button", { name: "上書きする" }).click();

  await expectImported(page);
  await gotoInApp(page, "/fiscal-periods");
  await expect(
    page.getByRole("button", { name: /^別に作った2026年分 / }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^2026年分 / })).toHaveCount(0);
  expect(await countStoredBooks(page)).toBe(1);
});

test("refuses a book whose dates overlap another period, and a file that is not a book", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const overlappingPath = await createBookFile("overlap.openkk", [
    { name: "2026年度", startDate: "2026-04-01", endDate: "2027-03-31" },
  ]);
  const textPath = path.join(makeTempDir(), "memo.openkk");
  fs.writeFileSync(textPath, "これは帳簿ではありません");

  await importBook(page, overlappingPath);
  await expect(
    page.getByText(
      "期間が重なる会計期間 (2026年分) があるため、「2026年度」を取り込めません。",
    ),
  ).toBeVisible();
  await importBook(page, textPath);
  await expect(
    page.getByText("このファイルはオープン会計の帳簿ではありません。"),
  ).toBeVisible();

  expect(await countStoredBooks(page)).toBe(1);
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
});

test("takes in a compressed file written by 26.3.1 and downloads a backup as a plain book", async ({
  page,
}) => {
  await startApp(page);
  await gotoInApp(page, "/fiscal-periods");
  await page.getByRole("button", { name: "ファイル", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: /ファイルを取り込む/ }),
  ).toContainText("以前の圧縮済みファイル (.zip) も取り込めます");
  await page.keyboard.press("Escape");
  await page.getByLabel("取り込むファイル").setInputFiles({
    name: "2024.zip",
    mimeType: "application/zip",
    buffer: fs.readFileSync(
      path.join(RELEASE_FIXTURE_DIR, "archive-2024-closed.zip"),
    ),
  });

  await expectStep(page, "次の期間へ");
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);
  await expect(page.getByRole("button", { name: /圧縮保存/ })).toHaveCount(0);
  const backupPath = await downloadFrom(page, "2024年分.openkk", () =>
    page.getByRole("button", { name: "バックアップをダウンロード" }).click(),
  );

  await expect(
    page.getByRole("status").filter({ hasText: "バックアップしました" }),
  ).toBeVisible();
  await expect(saveStatus(page)).toHaveText(/^前回 /);
  expect(await readBookPeriods(backupPath)).toEqual([
    { name: "2024年分", phase: "post_closing" },
  ]);
  await importBook(page, backupPath);
  await expect(
    page.getByRole("status").filter({ hasText: SAME_MESSAGE }),
  ).toBeVisible();
  expect(await countStoredBooks(page)).toBe(1);
});

test("reminds to save a period that was changed and not saved for 30 days", async ({
  page,
}) => {
  const start = Date.now();
  await page.clock.setFixedTime(start);
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const reminder = page
    .getByRole("status")
    .filter({ hasText: "まだバックアップしていません" });
  await expect(reminder).toHaveCount(0);

  await page.clock.setFixedTime(start + 31 * DAY_MS);
  await reloadInApp(page);
  await expect(reminder).toBeVisible();
  await downloadFrom(page, "2026年分.openkk", () =>
    reminder.getByRole("button", { name: "バックアップ" }).click(),
  );
  await expect(reminder).toHaveCount(0);

  await page.clock.setFixedTime(start + 80 * DAY_MS);
  await reloadInApp(page);
  await expect(page.getByText("30 日以上バックアップしていません")).toHaveCount(
    0,
  );
  await startOpenedPeriod(page);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "30 日以上バックアップしていません" }),
  ).toBeVisible();
});

test("moves the periods the previous version kept in this browser into one book each", async ({
  page,
}) => {
  const legacyPath = await createPreviousVersionDatabase([
    { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    year2026,
  ]);
  const legacyBytes = fs.readFileSync(legacyPath);
  await seedLegacyDatabase(page, legacyBytes);
  const oldVersionTab = await holdLegacyDatabaseInAnotherTab(page);

  await page.goto("/");
  await waitUntilBootPhase(page, "waiting-for-another-tab");
  await expect(page.getByRole("status")).toContainText(
    "別のタブで開いています",
  );
  await oldVersionTab.close();
  await waitUntilBootPhase(page, "ready");

  await expect(
    page.getByRole("status").filter({ hasText: KEPT_IN_BROWSER_MESSAGE }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^2025年分 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await waitUntilBooksStored(page);
  expect(await countStoredBooks(page)).toBe(2);
  await expectLegacyDatabaseKept(page, legacyBytes);

  await page.getByRole("button", { name: /^2025年分 / }).click();
  await page.getByRole("link", { name: "仕訳" }).click();
  await expect(page.getByText("2025年分の売上")).toBeVisible();
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);
  const savedPath = await saveBook(page, "2025年分.openkk");
  expect(await readBookPeriods(savedPath)).toEqual([
    { name: "2025年分", phase: "journalizing" },
  ]);

  await reloadInApp(page);
  await gotoInApp(page, "/fiscal-periods");
  await expect(page.getByRole("button", { name: /^2025年分 / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^2026年分 / })).toHaveCount(1);
  expect(await countStoredBooks(page)).toBe(2);
});

test("moves a database written by 26.3.1 into one book per period, merges a period imported back from its archive, and leaves that database as it was", async ({
  page,
}) => {
  const legacyBytes = fs.readFileSync(
    path.join(RELEASE_FIXTURE_DIR, "openkk.sqlite3"),
  );
  await seedLegacyDatabase(page, legacyBytes);

  await startApp(page);

  await expect(
    page.locator(".bk-fiscal-period-row").filter({ hasText: "2021年分" }),
  ).toContainText("データ削除済み");
  for (const name of ["2024年分", "2025年分", "2027年分"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${name} `) }),
    ).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: /^2023年分 / })).toHaveCount(1);
  await waitUntilBooksStored(page);
  expect(await countStoredBooks(page)).toBe(5);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("openkk.legacy-book.merged-fiscal-periods"),
    ),
  ).toBe(
    JSON.stringify([
      { name: "2023年分", startDate: "2023-01-01", endDate: "2023-12-31" },
    ]),
  );
  const mergedNotice = page.getByRole("status").filter({
    hasText: "前の版で「2023年分」が 2 つあったので、1 つにまとめました",
  });
  await expect(mergedNotice).toBeVisible();
  await mergedNotice.getByRole("button", { name: "閉じる" }).click();
  await expect(mergedNotice).toHaveCount(0);
  await reloadInApp(page);
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
  await expect(mergedNotice).toHaveCount(0);

  await page.getByRole("button", { name: /^2024年分 / }).click();
  await page.getByRole("link", { name: "仕訳" }).click();
  await expect(page.getByText("2024年12月", { exact: true })).toBeVisible();
  for (const description of ["ノートパソコンの減価償却", "家事按分の振替"]) {
    await expect(
      page.getByText(description, { exact: true }).first(),
    ).toBeVisible();
  }
  await showEarlierJournalMonth(page, 2024, 12, 8);
  await expect(page.getByText(/^まとめて取り込んだ仕訳 /)).toHaveText([
    "まとめて取り込んだ仕訳 A",
    "まとめて取り込んだ仕訳 B",
    "まとめて取り込んだ仕訳 C",
  ]);
  await showEarlierJournalMonth(page, 2024, 8, 5);
  await expect(page.getByText(/^同じ日の仕訳 /)).toHaveText([
    "同じ日の仕訳 1",
    "同じ日の仕訳 2",
    "同じ日の仕訳 4",
    "同じ日の仕訳 5",
    "同じ日の仕訳 6",
  ]);
  await expect(page.getByText(/^長い摘要のための文章です。/)).toHaveCount(1);
  await showEarlierJournalMonth(page, 2024, 5, 1);
  await expect(
    page.getByText("再振替: 年末の外注費 (未払)", { exact: true }),
  ).toBeVisible();

  await expectLegacyDatabaseKept(page, legacyBytes);
});

test("moves again a period the previous version changed after the move, and asks first when the app changed it too", async ({
  page,
}) => {
  const fixture = fs.readFileSync(
    path.join(RELEASE_FIXTURE_DIR, "openkk.sqlite3"),
  );
  await seedLegacyDatabase(page, fixture);
  await startApp(page);
  await expect(page.getByRole("button", { name: /^2025年分 / })).toHaveCount(1);
  await waitUntilBooksStored(page);
  const changedNotice = page.getByRole("status").filter({
    hasText: "前の版で「2025年分」が変わっています",
  });
  await expect(changedNotice).toHaveCount(0);

  await seedLegacyDatabase(
    page,
    legacyFixtureWithSales(fixture, ["前の版で足した売上 1"]),
  );
  await startApp(page);
  await changedNotice.getByRole("button", { name: "移し直す" }).click();
  await waitUntilBootPhase(page, "ready");
  await expect(changedNotice).toHaveCount(0);
  const sheet = await openSheetOf2025(page);
  await expect(sheet).toContainText("前の版で足した売上 1");

  await page.getByRole("button", { name: "月ごと", exact: true }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await drawer.getByLabel("摘要").fill("アプリで足した売上");
  await drawer.getByLabel("借方金額").first().fill("1000");
  await drawer.getByLabel("貸方金額").last().fill("1000");
  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible();
  await waitUntilBooksStored(page);

  await seedLegacyDatabase(
    page,
    legacyFixtureWithSales(fixture, [
      "前の版で足した売上 1",
      "前の版で足した売上 2",
    ]),
  );
  await startApp(page);
  const overwrite = page.getByRole("alertdialog", {
    name: "前の版での上書き",
  });
  await changedNotice.getByRole("button", { name: "移し直す" }).click();
  await expect(overwrite).toContainText(
    "アプリの中の「2025年分」に、移したあとで入れた変更があります。前の版を優先して上書きすると失われます。",
  );
  await overwrite.getByRole("button", { name: "キャンセル" }).click();
  await expect(overwrite).toHaveCount(0);
  await expect(changedNotice).toBeVisible();
  const kept = await openSheetOf2025(page);
  await expect(kept).toContainText("アプリで足した売上");
  await expect(kept).not.toContainText("前の版で足した売上 2");

  await changedNotice.getByRole("button", { name: "移し直す" }).click();
  await overwrite.getByRole("button", { name: "上書きする" }).click();
  await waitUntilBootPhase(page, "ready");
  await expect(changedNotice).toHaveCount(0);
  const replaced = await openSheetOf2025(page);
  await expect(replaced).toContainText("前の版で足した売上 2");
  await expect(replaced).not.toContainText("アプリで足した売上");
});

test("shows a period the previous version archived as an ordinary closed period that counts when dates overlap", async ({
  page,
}) => {
  const thisYear = new Date().getFullYear();
  const legacyPath = await createPreviousVersionDatabase([
    {
      name: "圧縮保存した期間",
      startDate: `${thisYear}-01-01`,
      endDate: `${thisYear}-12-31`,
    },
  ]);
  markArchivedByPreviousVersion(legacyPath);
  await seedLegacyDatabase(page, fs.readFileSync(legacyPath));

  await startApp(page);

  await expect(
    page.getByRole("button", { name: /^圧縮保存した期間 / }),
  ).toContainText("決算済み");
  await expect(page.getByText("圧縮保存済み")).toHaveCount(0);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(
    page.getByText("ほかの会計期間と日付が重なっています。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "作成する" })).toBeDisabled();
});

test("moves the periods it can read and shows the one it could not move", async ({
  page,
}) => {
  const legacyPath = await createPreviousVersionDatabase([
    { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    year2026,
  ]);
  makeUnreadableForThisVersion(legacyPath, "2025年分");
  const legacyBytes = fs.readFileSync(legacyPath);
  await seedLegacyDatabase(page, legacyBytes);

  await startApp(page);

  const unmovedNotice = page
    .getByRole("status")
    .filter({ hasText: UNMOVED_NOTICE });
  const unmovedRow = page
    .locator('.bk-fiscal-period-row[aria-disabled="true"]')
    .filter({ hasText: "2025年分" });
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2025年分 / })).toHaveCount(0);
  await expect(unmovedRow).toContainText("2025-01-01 〜 2025-12-31");
  await expect(unmovedRow).toContainText("移せませんでした");
  await expect(unmovedNotice).toBeVisible();
  await waitUntilBooksStored(page);
  expect(await countStoredBooks(page)).toBe(1);
  await expectLegacyDatabaseKept(page, legacyBytes);

  await unmovedNotice.getByRole("button", { name: "閉じる" }).click();
  await expect(unmovedNotice).toHaveCount(0);
  await reloadInApp(page);
  await waitUntilBootPhase(page, "ready");
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(unmovedRow).toBeVisible();
  await expect(unmovedNotice).toHaveCount(0);
  expect(await countStoredBooks(page)).toBe(1);
});

test("shows a book it cannot read as a row and tells so until the notice is closed", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  await waitUntilBooksStored(page);
  const newerPath = await createBookFile("newer.openkk", [
    { name: "2030年分", startDate: "2030-01-01", endDate: "2030-12-31" },
  ]);
  markMadeByNewerVersion(newerPath);
  await putBookIntoBrowser(
    page,
    "from-newer-version.openkk",
    fs.readFileSync(newerPath),
  );

  await gotoInApp(page, "/fiscal-periods");
  await waitUntilBootPhase(page, "ready");

  const unreadableNotice = page
    .getByRole("status")
    .filter({ hasText: UNREADABLE_NOTICE });
  const unreadableRow = page
    .locator('.bk-fiscal-period-row[aria-disabled="true"]')
    .filter({ hasText: "2030年分" });
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(unreadableRow).toContainText("2030-01-01 〜 2030-12-31");
  await expect(unreadableRow).toContainText("読み込めませんでした");
  await expect(unreadableNotice).toBeVisible();
  expect(await countStoredBooks(page)).toBe(2);

  await unreadableNotice.getByRole("button", { name: "閉じる" }).click();
  await expect(unreadableNotice).toHaveCount(0);
  await page.getByRole("button", { name: /^2026年分 / }).click();
  await expectStep(page, "期間を開始");
  await expect(unreadableNotice).toHaveCount(0);

  await gotoInApp(page, "/fiscal-periods");
  await waitUntilBootPhase(page, "ready");
  await expect(unreadableRow).toBeVisible();
  await expect(unreadableNotice).toBeVisible();
});

test("restores a book it cannot read from a backup of the same period, in place of the broken one", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const backup = await saveBook(page, "2026年分.openkk");
  const broken = path.join(makeTempDir(), "broken.openkk");
  fs.copyFileSync(backup, broken);
  makeUnreadableForThisVersion(broken, "2026年分");
  await overwriteStoredBooks(page, fs.readFileSync(broken));

  await gotoInApp(page, "/fiscal-periods");
  await waitUntilBootPhase(page, "ready");
  const unreadableRow = page
    .locator('.bk-fiscal-period-row[aria-disabled="true"]')
    .filter({ hasText: "2026年分" });
  await expect(unreadableRow).toContainText("読み込めませんでした");

  await importBook(page, backup);
  const dialog = page.getByRole("alertdialog", { name: OVERWRITE_TITLE });
  await expect(dialog).toContainText(CHANGED_OUTSIDE_MESSAGE);
  await dialog.getByRole("button", { name: "上書きする" }).click();

  await expectImported(page);
  await expectStep(page, "期間を開始");
  expect(await countStoredBooks(page)).toBe(1);
  await gotoInApp(page, "/fiscal-periods");
  await waitUntilBootPhase(page, "ready");
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await expect(unreadableRow).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: UNREADABLE_NOTICE }),
  ).toHaveCount(0);
});

function saveButton(page: Page) {
  return page
    .getByRole("complementary")
    .getByRole("button", { name: "バックアップ", exact: true });
}

function saveStatus(page: Page) {
  return page.getByRole("complementary").getByRole("status");
}

async function downloadFrom(
  page: Page,
  fileName: string,
  start: () => Promise<void>,
) {
  const downloadPromise = page.waitForEvent("download");
  await start();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(fileName);
  const filePath = path.join(makeTempDir(), fileName);
  await download.saveAs(filePath);
  return filePath;
}

async function saveBook(page: Page, fileName: string) {
  await waitUntilBooksStored(page);
  return downloadFrom(page, fileName, () => saveButton(page).click());
}

async function expectImported(page: Page) {
  await expect(page).toHaveURL(/\/steps(\/|$)/, { timeout: 15_000 });
  await waitUntilBootPhase(page, "ready");
}

async function importBook(page: Page, filePath: string) {
  await gotoInApp(page, "/fiscal-periods");
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
  await page.getByLabel("取り込むファイル").setInputFiles(filePath);
}

async function startOpenedPeriod(page: Page) {
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "期首のBSを入力");
  await waitUntilBooksStored(page);
}

async function countStoredBooks(page: Page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const books = await root.getDirectoryHandle("openkk-books", {
      create: true,
    });
    const names: string[] = [];
    for await (const name of (
      books as unknown as { keys(): AsyncIterable<string> }
    ).keys()) {
      names.push(name);
    }
    if (names.some((name) => !name.endsWith(".openkk"))) {
      throw new Error(`unfinished book files: ${names.join(", ")}`);
    }
    return names.length;
  });
}

async function expectLegacyDatabaseKept(page: Page, seeded: Buffer) {
  const kept = await readLegacyDatabase(page);
  expect(kept.names).toEqual(["/openkk.sqlite3"]);
  expect(Buffer.from(kept.bytes).equals(seeded)).toBe(true);
  expect(schemaVersionOf(kept.bytes)).toBe("5");
}

function legacyFixtureWithSales(
  fixture: Buffer,
  descriptions: readonly string[],
): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-legacy-change-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "openkk.sqlite3");
  fs.writeFileSync(filePath, fixture);
  const database = new DatabaseSync(filePath);
  try {
    const { id: fiscalPeriodId } = database
      .prepare(
        "SELECT id FROM fiscal_periods WHERE json_extract(data, '$.name') = ?",
      )
      .get("2025年分") as { id: string };
    descriptions.forEach((description, index) => {
      const entryId = `entry_changed_in_previous_version_${index}`;
      const at = Date.parse("2025-07-01T00:00:00.000Z") + index;
      database
        .prepare(
          "INSERT INTO entries (id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES (?, ?, '2025-07-01', NULL, ?, 1, ?, ?)",
        )
        .run(entryId, fiscalPeriodId, description, at, at);
      for (const [position, side, account] of [
        [0, "debit", "acct_cash"],
        [1, "credit", "acct_sales"],
      ] as const) {
        database
          .prepare(
            "INSERT INTO entry_lines (entry_id, id, side, book_account_id, amount, partner_name, tax_category_id, business_category_id, position) VALUES (?, ?, ?, ?, 3000, '', 'tax_10', 'biz_5', ?)",
          )
          .run(entryId, `${entryId}_${side}`, side, account, position);
      }
    });
  } finally {
    database.close();
  }
  return fs.readFileSync(filePath);
}

async function openSheetOf2025(page: Page) {
  await gotoInApp(page, "/fiscal-periods");
  await page.getByRole("button", { name: /^2025年分 / }).click();
  await page.getByRole("link", { name: "仕訳", exact: true }).click();
  await page.getByRole("button", { name: "シート", exact: true }).click();
  const sheet = page.getByRole("table", { name: "仕訳のシート" });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function seedLegacyDatabase(page: Page, bytes: Buffer) {
  await page.context().route(`**${LEGACY_SEED_PATH}**`, async (route) => {
    const relative = new URL(route.request().url()).pathname.slice(
      LEGACY_SEED_PATH.length,
    );
    if (relative === "") {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>legacy seed</title>",
      });
      return;
    }
    const workerBody = LEGACY_WORKERS[relative];
    if (workerBody != null) {
      await route.fulfill({
        contentType: "text/javascript",
        body: workerBody,
      });
      return;
    }
    const file = path.join(
      SQLITE_WASM_DIR,
      relative.replace(/^sqlite-wasm\//, ""),
    );
    await route.fulfill({
      path: file,
      contentType: file.endsWith(".wasm")
        ? "application/wasm"
        : "text/javascript",
    });
  });
  await page.goto(LEGACY_SEED_PATH);
  await page.evaluate(
    async ({ workerUrl, data }) => {
      const worker = new Worker(workerUrl, { type: "module" });
      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (
          event: MessageEvent<{ ok: boolean; error: string | null }>,
        ) => {
          if (event.data.ok) resolve();
          else reject(new Error(event.data.error ?? "seed failed"));
        };
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(new Uint8Array(data));
      });
      worker.terminate();
    },
    { workerUrl: `${LEGACY_SEED_PATH}worker.mjs`, data: [...bytes] },
  );
}

async function showEarlierJournalMonth(
  page: Page,
  year: number,
  fromMonth: number,
  toMonth: number,
) {
  for (let month = fromMonth - 1; month >= toMonth; month -= 1) {
    await page.getByRole("button", { name: "前の月" }).click();
    await expect(
      page.getByText(`${year}年${month}月`, { exact: true }),
    ).toBeVisible();
  }
}

async function readLegacyDatabase(
  page: Page,
): Promise<{ names: string[]; bytes: Uint8Array }> {
  const reader = await page.context().newPage();
  try {
    await reader.goto(LEGACY_SEED_PATH);
    const read = await reader.evaluate(async (workerUrl) => {
      const worker = new Worker(workerUrl, { type: "module" });
      const result = await new Promise<{
        names: string[];
        bytes: number[] | null;
      }>((resolve, reject) => {
        worker.onmessage = (
          event: MessageEvent<{
            ok: boolean;
            names: string[];
            bytes: Uint8Array | null;
            error: string | null;
          }>,
        ) => {
          if (!event.data.ok) {
            reject(new Error(event.data.error ?? "read failed"));
            return;
          }
          resolve({
            names: event.data.names,
            bytes: event.data.bytes == null ? null : [...event.data.bytes],
          });
        };
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(null);
      });
      worker.terminate();
      return result;
    }, `${LEGACY_SEED_PATH}read-worker.mjs`);
    if (read.bytes == null) {
      throw new Error(`the previous version holds ${read.names.join(", ")}`);
    }
    return { names: read.names, bytes: new Uint8Array(read.bytes) };
  } finally {
    await reader.close();
  }
}

function schemaVersionOf(bytes: Uint8Array): unknown {
  const filePath = path.join(makeTempDir(), "openkk.sqlite3");
  fs.writeFileSync(filePath, bytes);
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    return database
      .prepare("SELECT value FROM openkk_meta WHERE key = 'schema_version'")
      .get()?.value;
  } finally {
    database.close();
  }
}

async function holdLegacyDatabaseInAnotherTab(page: Page) {
  const otherTab = await page.context().newPage();
  await otherTab.goto(LEGACY_SEED_PATH);
  await otherTab.evaluate(() => {
    void navigator.locks.request(
      "openkk-db:openkk.sqlite3",
      () => new Promise<void>(() => {}),
    );
  });
  return otherTab;
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-books-e2e-"));
  tempDirs.push(dir);
  return dir;
}

async function createBookFile(fileName: string, periods: PeriodInput[]) {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const filePath = path.join(makeTempDir(), fileName);
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    for (const period of periods) {
      await adapter.db.fiscalPeriods.create(USER_ID, period);
    }
  } finally {
    adapter.close();
  }
  return filePath;
}

async function createPreviousVersionDatabase(periods: PeriodInput[]) {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const filePath = path.join(makeTempDir(), "openkk.sqlite3");
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    for (const period of periods) {
      const created = await adapter.db.fiscalPeriods.create(USER_ID, period);
      await adapter.db.fiscalPeriods.start(created.id);
      await adapter.db.fiscalPeriods.patch(created.id, {
        openingBalancesCompleted: true,
      });
      await adapter.db.entries.create(USER_ID, created.id, {
        date: period.endDate,
        description: `${period.name}の売上`,
        localId: null,
        businessRate: 1,
        lines: [
          { side: "debit" as const, bookAccountId: "acct_cash" },
          { side: "credit" as const, bookAccountId: "acct_sales" },
        ].map((line) => ({
          ...line,
          amount: 1000,
          partnerName: "",
          taxCategoryId: "",
          businessCategoryId: "",
        })),
      });
    }
  } finally {
    adapter.close();
  }
  const database = new DatabaseSync(filePath);
  try {
    database.exec(
      "UPDATE openkk_meta SET value = '5' WHERE key = 'schema_version'",
    );
    database.exec("DELETE FROM openkk_meta WHERE key = 'last_changed_at'");
  } finally {
    database.close();
  }
  return filePath;
}

function markMadeByNewerVersion(filePath: string) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec(
      "UPDATE openkk_meta SET value = '999' WHERE key = 'schema_version'",
    );
  } finally {
    database.close();
  }
}

async function putBookIntoBrowser(page: Page, name: string, bytes: Buffer) {
  await page.evaluate(
    async ({ bookName, data }) => {
      const root = await navigator.storage.getDirectory();
      const books = await root.getDirectoryHandle("openkk-books", {
        create: true,
      });
      const file = await books.getFileHandle(bookName, { create: true });
      const writable = await (
        file as unknown as {
          createWritable(): Promise<{
            write(content: Uint8Array): Promise<void>;
            close(): Promise<void>;
          }>;
        }
      ).createWritable();
      await writable.write(new Uint8Array(data));
      await writable.close();
    },
    { bookName: name, data: [...bytes] },
  );
}

async function overwriteStoredBooks(page: Page, bytes: Buffer) {
  await page.evaluate(
    async ({ data }) => {
      const root = await navigator.storage.getDirectory();
      const books = await root.getDirectoryHandle("openkk-books", {
        create: true,
      });
      const names: string[] = [];
      for await (const name of (
        books as unknown as { keys(): AsyncIterable<string> }
      ).keys()) {
        names.push(name);
      }
      for (const name of names) {
        const file = await books.getFileHandle(name, { create: false });
        const writable = await (
          file as unknown as {
            createWritable(): Promise<{
              write(content: Uint8Array): Promise<void>;
              close(): Promise<void>;
            }>;
          }
        ).createWritable();
        await writable.write(new Uint8Array(data));
        await writable.close();
      }
    },
    { data: [...bytes] },
  );
}

function makeUnreadableForThisVersion(filePath: string, periodName: string) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec("PRAGMA ignore_check_constraints = ON");
    database
      .prepare(
        "UPDATE fiscal_periods SET data = json_set(data, '$.phase', 'unknown_phase') WHERE json_extract(data, '$.name') = ?",
      )
      .run(periodName);
  } finally {
    database.close();
  }
}

function markArchivedByPreviousVersion(filePath: string) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec(
      `UPDATE fiscal_periods SET data = json_set(
        data,
        '$.phase', 'post_closing',
        '$.documentsReceivedCompleted', json('true'),
        '$.archiveStatus', 'archived',
        '$.archivedAt', '2027-03-01T00:00:00.000Z'
      )`,
    );
  } finally {
    database.close();
  }
}

async function renamePeriodLikeCli(filePath: string, name: string) {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    const [period] = await adapter.db.fiscalPeriods.getAll(USER_ID);
    if (period == null) throw new Error("the book holds no fiscal period");
    await adapter.db.fiscalPeriods.patch(period.id, { name });
  } finally {
    adapter.close();
  }
}

async function readBookPeriods(
  filePath: string,
): Promise<Array<{ name: string; phase: string }>> {
  const { createDiskDbAdapter } =
    await import("@rubydogjp/openkk-disk-db-adapter");
  const adapter = await createDiskDbAdapter(filePath, null);
  try {
    return (await adapter.db.fiscalPeriods.getAll(USER_ID)).map(
      ({ name, phase }) => ({ name, phase }),
    );
  } finally {
    adapter.close();
  }
}
