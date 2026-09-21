import { expect, test } from "@playwright/test";
import { clickButton, expectStep } from "../helpers";

const storedText = "保存済みの長い名称😀".repeat(50);

test("carries archived text into a persistent next period and keeps it when editing", async ({
  page,
}) => {
  await page.goto("/fiscal-periods");
  await page.locator('input[type="file"]').setInputFiles({
    name: "2026.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archivedPeriod()),
  });
  await expectStep(page, "次の期間へ");
  const reversal = page.getByRole("checkbox", { name: new RegExp(storedText) });
  await reversal.locator("..").click();
  await expect(reversal).toBeChecked();
  await clickButton(page, "次期を作成");
  await expectStep(page, "期間を開始");
  await clickButton(page, "開始する");
  await clickButton(page, "開始する");
  await expectStep(page, "日々の仕訳");
  await page.reload();
  await expectStep(page, "日々の仕訳");

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "補助" })
    .click();
  await page
    .getByRole("button", { name: /固定資産 数年かけて費用になる資産/ })
    .click();
  await page.getByText(storedText, { exact: true }).click();
  const asset = page.getByRole("dialog", { name: "固定資産の編集" });
  await expect(asset.getByLabel("名称")).toHaveValue(storedText);
  await asset.getByLabel("耐用年数 (年)").fill("5");
  await clickButton(page, "保存");
  await expect(asset).not.toBeVisible();
  await page.getByText(storedText, { exact: true }).click();
  await expect(asset.getByLabel("名称")).toHaveValue(storedText);
  await expect(asset.getByLabel("耐用年数 (年)")).toHaveValue("5");
  await asset.getByRole("button", { name: "キャンセル" }).click();

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "補助" })
    .click();
  await page
    .getByRole("button", { name: /再振替 一時的な調整に使う特別な仕訳データ/ })
    .click();
  await page
    .getByRole("button", { name: new RegExp(`再振替: ${storedText}`) })
    .first()
    .click();
  const journal = page.getByRole("dialog", { name: "仕訳の編集" });
  await expect(journal.getByLabel("摘要")).toHaveValue(`再振替: ${storedText}`);
  for (const amount of [
    journal.getByLabel("借方金額").first(),
    journal.getByLabel("貸方金額").last(),
  ]) {
    await amount.click();
    await amount.press("ControlOrMeta+A");
    await amount.pressSequentially("2000");
    await expect(amount).toHaveValue("2000");
  }
  await clickButton(page, "保存");
  await expect(journal).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp(`再振替: ${storedText}`) })
    .first()
    .click();
  await expect(journal.getByLabel("摘要")).toHaveValue(`再振替: ${storedText}`);
  await expect(journal.getByLabel("借方金額").first()).toHaveValue("2,000");
});

async function archivedPeriod(): Promise<Uint8Array> {
  const { buildFiscalPeriodArchivePayload, createFiscalPeriodArchiveZip } =
    await import("@rubydogjp/openkk-client-domain");
  const { createMemoryDbAdapter } =
    await import("@rubydogjp/openkk-memory-db-adapter");
  const { buildExpectedClosingEntries, createOpenkkServer } =
    await import("@rubydogjp/openkk-server");
  const db = await createMemoryDbAdapter(null);
  const server = createOpenkkServer(db, { userId: "source-user" });
  let period = await server.fiscalPeriods.create({
    name: "2026年",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  await server.fiscalPeriods.patch(period.id, {
    settingsCompleted: true,
    openingBalancesCompleted: true,
  });
  await db.entries.create(period.userId, period.id, {
    date: period.endDate,
    description: storedText,
    localId: null,
    businessRate: 1,
    lines: [
      { side: "debit", bookAccountId: "acct_supplies" },
      { side: "credit", bookAccountId: "acct_accrued_expense" },
    ].map((line) => ({
      side: line.side as "debit" | "credit",
      bookAccountId: line.bookAccountId,
      amount: 1000,
      partnerName: storedText,
      taxCategoryId: storedText,
      businessCategoryId: storedText,
    })),
  });
  await db.fixedAssets.create(period.userId, period.id, {
    name: storedText,
    acquisitionDate: period.startDate,
    acquisitionCost: 120000,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    bookAccountId: "acct_equipment",
  });
  const fixedAssets = await server.fixedAssets.getAll(period.id);
  await server.preClosings.run({ fiscalPeriodId: period.id, year: 2026 });
  await server.closings.run({
    fiscalPeriodId: period.id,
    year: 2026,
    entries: buildExpectedClosingEntries({
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: await server.entries.getAll(period.id),
      fixedAssets,
      openingJournals: [],
      bookAccounts: await server.masterData.getBookAccounts(),
    }),
  });
  period = await server.fiscalPeriods.patch(period.id, {
    documentsReceivedCompleted: true,
  });
  return createFiscalPeriodArchiveZip(
    buildFiscalPeriodArchivePayload({
      createdAt: "2027-01-01T00:00:00.000Z",
      fiscalPeriod: period,
      entries: await server.entries.getAll(period.id),
      fixedAssets,
      closings: [
        { fiscalPeriodId: period.id, year: 2026, kind: "pre_closing" },
        { fiscalPeriodId: period.id, year: 2026, kind: "closing" },
      ],
    }),
  );
}
