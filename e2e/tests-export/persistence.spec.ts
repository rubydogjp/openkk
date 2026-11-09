import { expect, test } from "@playwright/test";
import {
  advanceToJournalizing,
  clickButton,
  createFiscalPeriod,
  gotoInApp,
  keepBooksInApp,
  reloadInApp,
  startWithNewBook,
} from "../helpers";

type PersistentStorageProbe = { persistentStorageRequests: string[] };

test("asks the browser to keep the books once one is made in the app", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const storage = navigator.storage;
    const persisted = storage.persisted.bind(storage);
    const persist = storage.persist.bind(storage);
    const requests: string[] = [];
    Object.assign(window, { persistentStorageRequests: requests });
    storage.persisted = async () => {
      requests.push("persisted");
      return persisted();
    };
    storage.persist = async () => {
      requests.push("persist");
      return persist();
    };
  });

  await keepBooksInApp(page);
  await page.goto("/");
  await expect(page.getByText("アプリの中に保存します")).toBeVisible();
  await clickButton(page, "新しい帳簿を作る");

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as PersistentStorageProbe)
            .persistentStorageRequests,
      ),
    )
    .toEqual(["persisted", "persist"]);
});

test("keeps a fiscal period and entry in the book across reloads", async ({
  page,
}) => {
  await startWithNewBook(page);
  await createFiscalPeriod(page, "保存検証期間");
  await advanceToJournalizing(page);
  await page.getByRole("link", { name: "仕訳" }).click();
  await page.getByRole("button", { name: "最初の仕訳を作成" }).click();

  const drawer = page.getByRole("dialog", { name: "仕訳の新規作成" });
  await drawer.getByLabel("摘要").fill("永続化検証の仕訳");
  await drawer.getByLabel("借方金額").first().fill("50000");
  await drawer.getByLabel("貸方金額").last().fill("50000");
  await clickButton(page, "作成");
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText("永続化検証の仕訳")).toBeVisible();

  await reloadInApp(page);
  await expect(page.getByText("永続化検証の仕訳")).toBeVisible();
  await page
    .getByRole("button", { name: /永続化検証の仕訳/ })
    .first()
    .click();
  const savedEntry = page.getByRole("dialog", { name: "仕訳の編集" });
  await expect(savedEntry.getByLabel("借方金額").first()).toHaveValue("50,000");
  await expect(savedEntry.getByLabel("貸方金額").last()).toHaveValue("50,000");

  await gotoInApp(page, "/fiscal-periods");
  await expect(
    page.getByRole("button", { name: /^保存検証期間 \d{4}-/ }),
  ).toBeVisible();
});
