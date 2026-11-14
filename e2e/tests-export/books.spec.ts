import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

import { archivedPeriodZip } from "../archived-period";
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
const UNSAVED_STATUS = "保存していない変更があります";
const SAME_MESSAGE = "今のデータと同じです。";
const CHANGED_OUTSIDE_MESSAGE =
  "アプリの外で変更がありました。取り込むと、アプリの中の帳簿をこのファイルの内容に置き換えます。";
const REPLACES_APP_CHANGES_MESSAGE =
  "保存したあとにアプリで変えた内容は失われます。";
const CHANGED_BOTH_MESSAGE =
  "アプリの外で変更がありました。アプリの中にも保存していない変更があります。取り込むと、アプリの中の変更は失われます。";
const LEGACY_SEED_PATH = "/__legacy-seed/";
const SQLITE_WASM_DIR = path.resolve("node_modules/@sqlite.org/sqlite-wasm");
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

type PeriodInput = { name: string; startDate: string; endDate: string };

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

test("explains once, on the first launch, how the data is kept", async ({
  page,
}) => {
  await page.goto("/");
  await waitUntilBootPhase(page, "ready");
  const notice = page.getByRole("dialog", { name: "データの保存について" });
  await expect(notice).toContainText("7 日ほど開かないとデータが消える");
  await expect(notice).toContainText("左上の「保存」");

  await notice.getByRole("button", { name: "わかりました" }).click();
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
  await expect(saveButton(page)).toHaveCount(0);
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

test("restores a saved file after asking, and can save the current data first", async ({
  page,
}) => {
  await startApp(page);
  await createFiscalPeriod(page, "2026年分");
  const beforeStart = await saveBook(page, "2026年分.openkk");
  await startOpenedPeriod(page);

  await importBook(page, beforeStart);
  const dialog = page.getByRole("alertdialog", {
    name: "帳簿を置き換えますか？",
  });
  await expect(dialog).toContainText(REPLACES_APP_CHANGES_MESSAGE);
  const afterStart = await downloadFrom(page, "2026年分.openkk", () =>
    dialog.getByRole("button", { name: "先に今のデータを保存" }).click(),
  );
  await expect(
    dialog.getByRole("button", { name: "保存しました" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "取り込む" }).click();

  await expectImported(page);
  await expectStep(page, "期間を開始");
  expect(await readBookPeriods(afterStart)).toEqual([
    { name: "2026年分", phase: "journalizing" },
  ]);
  expect(await countStoredBooks(page)).toBe(1);

  await importBook(page, afterStart);
  await expect(dialog).toContainText(CHANGED_OUTSIDE_MESSAGE);
  await dialog.getByRole("button", { name: "取り込む" }).click();
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
  const dialog = page.getByRole("alertdialog", {
    name: "帳簿を置き換えますか？",
  });
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
  const dialog = page.getByRole("alertdialog", {
    name: "帳簿を置き換えますか？",
  });
  await expect(dialog).toContainText(CHANGED_OUTSIDE_MESSAGE);
  await dialog.getByRole("button", { name: "キャンセル" }).click();

  await page.getByRole("button", { name: /^2026年分 / }).click();
  await startOpenedPeriod(page);
  await importBook(page, savedPath);
  await expect(dialog).toContainText(CHANGED_BOTH_MESSAGE);
  await dialog.getByRole("button", { name: "取り込む" }).click();

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
  const dialog = page.getByRole("alertdialog", {
    name: "帳簿を置き換えますか？",
  });
  await expect(dialog).toContainText(
    "別に作られた同じ期間 (2026年分) の帳簿です。取り込むと、今の帳簿はすべて置き換わります。",
  );
  await dialog.getByRole("button", { name: "取り込む" }).click();

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

test("takes in a compressed file of the previous version and downloads a backup as a plain book", async ({
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
    name: "2026.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archivedPeriodZip()),
  });

  await expectStep(page, "次の期間へ");
  await expect(saveStatus(page)).toHaveText(UNSAVED_STATUS);
  await expect(page.getByRole("button", { name: /圧縮保存/ })).toHaveCount(0);
  const backupPath = await downloadFrom(page, "2026年.openkk", () =>
    page.getByRole("button", { name: "バックアップをダウンロード" }).click(),
  );

  await expect(
    page.getByRole("status").filter({ hasText: "ファイルに保存しました" }),
  ).toBeVisible();
  await expect(saveStatus(page)).toHaveText(/^前回 /);
  expect(await readBookPeriods(backupPath)).toEqual([
    { name: "2026年", phase: "post_closing" },
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
    .filter({ hasText: "まだファイルに保存していません" });
  await expect(reminder).toHaveCount(0);

  await page.clock.setFixedTime(start + 31 * DAY_MS);
  await reloadInApp(page);
  await expect(reminder).toBeVisible();
  await downloadFrom(page, "2026年分.openkk", () =>
    reminder.getByRole("button", { name: "保存" }).click(),
  );
  await expect(reminder).toHaveCount(0);

  await page.clock.setFixedTime(start + 80 * DAY_MS);
  await reloadInApp(page);
  await expect(page.getByText("30 日、ファイルに保存していません")).toHaveCount(
    0,
  );
  await startOpenedPeriod(page);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "30 日、ファイルに保存していません" }),
  ).toBeVisible();
});

test("moves the periods the previous version kept in this browser into one book each", async ({
  page,
}) => {
  const legacyPath = await createPreviousVersionDatabase([
    { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    year2026,
  ]);
  await seedLegacyDatabase(page, fs.readFileSync(legacyPath));
  const oldVersionTab = await holdLegacyDatabaseInAnotherTab(page);

  await page.goto("/");
  await waitUntilBootPhase(page, "waiting-for-another-tab");
  await expect(page.getByRole("status")).toContainText(
    "別のタブで開いています",
  );
  await oldVersionTab.close();
  await waitUntilBootPhase(page, "ready");

  await page
    .getByRole("dialog", { name: "データの保存について" })
    .getByRole("button", { name: "わかりました" })
    .click();
  await expect(page.getByRole("button", { name: /^2025年分 / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2026年分 / })).toBeVisible();
  await waitUntilBooksStored(page);
  expect(await countStoredBooks(page)).toBe(2);
  expect(await hasPreviousVersionStorage(page)).toBe(true);

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

function saveButton(page: Page) {
  return page
    .getByRole("complementary")
    .getByRole("button", { name: "ファイルに保存" });
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

async function hasPreviousVersionStorage(page: Page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.getDirectoryHandle(".openkk", { create: false });
      return true;
    } catch {
      return false;
    }
  });
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
    if (relative === "worker.mjs") {
      await route.fulfill({
        contentType: "text/javascript",
        body: LEGACY_SEED_WORKER,
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
