import { expect, test, type Page } from "@playwright/test";

const YEAR_ENTRIES_FIXTURE = "e2e/fixtures/dev-closing-entries.json";

test.describe("openkk closing flow", () => {
  test("creates a period, imports entries, and completes closing", async ({
    page,
  }) => {
    await createDevFiscalPeriodFromZero(page);

    await expectStep(page, "期間を開始");
    await clickButton(page, "開始する");
    await clickButton(page, "開始する");

    await expectStep(page, "期首のBSを入力");
    await fillOpeningAmount(page, 0, "100000");
    await fillOpeningAmount(page, 6, "150000");
    await fillOpeningAmount(page, 24, "250000");
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
    await clickButton(page, "次の手順へ");

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
    await page.getByRole("button", { name: "次の月" }).click();
    await page.getByRole("button", { name: "次の月" }).click();
    await page.getByRole("button", { name: "次の月" }).click();
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

    await page.getByRole("link", { name: "補助" }).click();
    await page
      .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
      .click();
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
    await clickButton(page, "圧縮保存");
    const download = await downloadPromise;
    const archivePath = await download.path();
    expect(archivePath).not.toBeNull();
    await expect(
      page.getByRole("heading", {
        name: "検証用 2026年分 長い名称 ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      }),
    ).toBeVisible();
    await expect(page.getByText("圧縮保存済み").first()).toBeVisible();

    await openFiscalPeriodList(page);
    await expect(
      page
        .getByRole("button", {
          name: /検証用 2026年分 長い名称 ABCDEFGHIJKLMNOPQRSTUVWXYZ/,
        })
        .filter({ hasText: "圧縮保存済み" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ファイル" }).click();
    await page
      .getByRole("button", { name: "圧縮済みのファイルを選択" })
      .click();
    await page
      .locator('input[type="file"][accept*=".zip"]')
      .setInputFiles(archivePath!);

    // 圧縮ファイルを取り込むと、後から解凍する経路が無いため、その場で展開して
    // 編集可能な（active）期間として復元する。読み取り専用のアーカイブ画面には入らない。
    await expectStep(page, "次の期間へ");
    await expect(page.getByRole("button", { name: "圧縮保存" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "圧縮済みファイルをダウンロード" }),
    ).not.toBeVisible();
    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page).toHaveURL(/\/entries\/?/);
    await expect(page.getByText("2026年9月")).toBeVisible();
    await expect(page.getByText("秋商材の仕入と配送費").first()).toBeVisible();
    await openFiscalPeriodList(page);
    await page
      .getByRole("button", {
        name: /検証用 2026年分 長い名称 ABCDEFGHIJKLMNOPQRSTUVWXYZ/,
      })
      .filter({ hasText: "圧縮保存済み" })
      .click();
    await expect(page).toHaveURL(/\/steps\/?$/);
    await expectArchivedScreen(page);

    await page.getByRole("link", { name: "仕訳" }).click();
    await expect(page).toHaveURL(/\/steps\/?$/);
    await expectArchivedScreen(page);
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
  await page
    .getByRole("button", { name: /年分|期間 未選択/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "リストを開く" }).click();
  await expect(page.getByRole("heading", { name: "期間の選択" })).toBeVisible();
}

async function importYearEntries(page: Page) {
  await page.getByRole("link", { name: "仕訳" }).click();
  await page.getByRole("button", { name: "ファイル" }).click();
  await page
    .locator('input[type="file"][accept*=".json"]')
    .setInputFiles(YEAR_ENTRIES_FIXTURE);
  await expect(page.getByText(/取り込みました\(取込 13 件/)).toBeVisible();
}

async function fillOpeningAmount(
  page: Page,
  inputIndex: number,
  value: string,
) {
  await page.locator(".bk-amount-input").nth(inputIndex).fill(value);
}

async function createFixedAssetDuringScenario(page: Page) {
  await page.getByRole("link", { name: "補助" }).click();
  await expect(page.getByRole("heading", { name: "補助" })).toBeVisible();
  await page
    .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
    .click();
  await expect(page.getByText("まだ固定資産がありません")).toBeVisible();
  await page.getByRole("button", { name: "追加" }).click();
  const drawer = page.getByRole("dialog", { name: "固定資産の追加" });
  await expect(drawer).toBeVisible();
  await drawer
    .getByLabel("名称")
    .fill("検証用固定資産 長い名称のノートPC兼撮影機材");
  await drawer.getByLabel("取得日").fill("2026-04-01");
  await drawer.getByLabel("取得価額").fill("420000");
  await drawer.getByLabel("耐用年数 (年)").fill("4");
  await clickButton(page, "保存");
  await expect(
    page.getByText("検証用固定資産 長い名称のノートPC兼撮影機材"),
  ).toBeVisible();
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

  await page.getByRole("button", { name: "次の月" }).click();
  await page.getByRole("button", { name: "次の月" }).click();
  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.getByText("2026年12月")).toBeVisible();
  const macbookDepreciationRow = page.getByRole("button", {
    name: /MacBook Pro 14インチ相当の減価償却/,
  });
  await expect(macbookDepreciationRow).toBeVisible();
  await expect(macbookDepreciationRow).toContainText("減価償却費");
  await expect(macbookDepreciationRow).toContainText("94,500");

  await page.getByRole("link", { name: "補助" }).click();
  await expect(page.getByRole("heading", { name: "補助" })).toBeVisible();
  await page
    .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
    .click();
  await expect(
    page.getByText("検証用固定資産 長い名称のノートPC兼撮影機材"),
  ).toBeVisible();
}

async function expectStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 15_000,
  });
}

async function expectArchivedScreen(page: Page) {
  await expect(page.getByText("圧縮保存済み").first()).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "圧縮済みファイルをダウンロード",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "仕訳" })).not.toBeVisible();
}

async function clickButton(page: Page, name: string) {
  const dialog = page.locator(".bk-dialog-card");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name }).click();
    return;
  }
  await page.getByRole("button", { name }).last().click();
}
