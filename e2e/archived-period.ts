export const storedText = "保存済みの長い名称😀".repeat(50);

export async function archivedPeriodZip(): Promise<Uint8Array> {
  const {
    archiveClosingRecords,
    buildFiscalPeriodArchivePayload,
    createFiscalPeriodArchiveZip,
  } = await import("@rubydogjp/openkk-driver");
  const { createMemoryDbAdapter } =
    await import("@rubydogjp/openkk-memory-db-adapter");
  const { buildExpectedClosingEntries } =
    await import("@rubydogjp/openkk-engine");
  const { createOpenkkServer } = await import("@rubydogjp/openkk-backend-api");
  const db = await createMemoryDbAdapter(null);
  const server = createOpenkkServer(db, { userId: "source-user" });
  let period = await server.fiscalPeriods.create({
    name: "2026年",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  await server.fiscalPeriods.start(period.id);
  await server.fiscalPeriods.patch(period.id, {
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
  await server.preClosings.run(period.id);
  await server.closings.run(
    period.id,
    buildExpectedClosingEntries({
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: await server.entries.getAll(period.id),
      fixedAssets,
      openingJournals: [],
      bookAccounts: await server.masterData.getBookAccounts(),
    }),
  );
  period = await server.fiscalPeriods.patch(period.id, {
    documentsReceivedCompleted: true,
  });
  return createFiscalPeriodArchiveZip(
    buildFiscalPeriodArchivePayload({
      createdAt: "2027-01-01T00:00:00.000Z",
      fiscalPeriod: period,
      entries: await server.entries.getAll(period.id),
      fixedAssets,
      closings: archiveClosingRecords(period),
    }),
  );
}
