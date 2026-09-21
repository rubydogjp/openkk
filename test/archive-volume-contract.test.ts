import { expect, it } from "vitest";
import {
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} from "../packages/client-domain/src/index.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";

it("restores an archive containing multiple entry import batches", async () => {
  const source = createOpenkkServer(await createMemoryDbAdapter(null), { userId: "user-1" });
  const period = await source.fiscalPeriods.create({
    name: "2026年分", startDate: "2026-01-01", endDate: "2026-12-31",
  });
  await source.fiscalPeriods.patch(period.id, {
    settingsCompleted: true, openingBalancesCompleted: true,
  });
  for (const batch of [0, 1]) {
    await source.entries.importMany(period.id, Array.from({ length: 5_001 }, (_, index) => ({
      date: "2026-06-01",
      description: "売上",
      localId: `${batch}-${index}`,
      businessRate: 1,
      lines: (["debit", "credit"] as const).map((side) => ({
        side,
        bookAccountId: side === "debit" ? "acct_cash" : "acct_sales",
        amount: 100,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      })),
    })));
  }
  await source.preClosings.run({ fiscalPeriodId: period.id, year: 2026 });
  await source.closings.run({ fiscalPeriodId: period.id, year: 2026, entries: [] });
  const closed = await source.fiscalPeriods.patch(period.id, { documentsReceivedCompleted: true });
  const entries = await source.entries.getAll(period.id);
  const zip = createFiscalPeriodArchiveZip(buildFiscalPeriodArchivePayload({
    createdAt: "2027-01-01T00:00:00Z",
    fiscalPeriod: closed,
    entries,
    fixedAssets: [],
    closings: ["pre_closing", "closing"].map((kind) => ({ fiscalPeriodId: period.id, year: 2026, kind })),
  }));
  const target = createOpenkkServer(await createMemoryDbAdapter(null), { userId: "user-1" });
  const restored = await target.fiscalPeriods.importArchived(readFiscalPeriodArchiveZip(zip));
  const restoredEntries = await target.entries.getAll(restored.id);
  const content = (items: typeof entries) => items.map(({ date, description, businessRate, localId, lines }) => ({
    date, description, businessRate, localId,
    lines: lines.map(({ side, bookAccountId, amount, partnerName, taxCategoryId, businessCategoryId }) => ({
      side, bookAccountId, amount, partnerName, taxCategoryId, businessCategoryId,
    })),
  })).sort((a, b) => a.localId!.localeCompare(b.localId!));
  expect(restoredEntries).toHaveLength(10_002);
  expect(content(restoredEntries)).toEqual(content(entries));
}, 30_000);
