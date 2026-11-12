import { describe, expect, it } from "vitest";
import {
  archiveClosingRecords,
  buildClosingVirtualEntries,
  buildFiscalPeriodArchivePayload,
  computeFsAggregate,
  createLegacyArchiveZip,
  readLegacyArchiveZip,
  withClosingVirtualEntries,
} from "../packages/driver/src/domain/index.js";
import { entryRecord } from "../packages/driver/test-support/entry-record.js";
import { mapFixedAsset } from "../packages/driver/src/domain/assist/stored-record-mapping.js";
import { entryRecordToImportPayload } from "../packages/driver/src/domain/entries/entry-input-mapping.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkBackendApi } from "../packages/backend-api/src/index.js";

describe("archived closing reports", () => {
  it.each(
    (["active", "sold", "disposed"] as const).flatMap((status) =>
      ["PC", "資".repeat(400), "😀".repeat(200)].map((name) => ({
        status,
        name,
        nameLength: name.length,
      })),
    ),
  )(
    "preserves closing amounts after restoring a $status asset with a $nameLength character name",
    async ({ status, name }) => {
      const backendApi = createOpenkkBackendApi(
        await createMemoryDbAdapter(null),
        {
          userId: "user-1",
        },
      );
      const period = await backendApi.fiscalPeriods.create({
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await backendApi.fiscalPeriods.start(period.id);
      await backendApi.fiscalPeriods.patch(period.id, {
        openingBalancesCompleted: true,
      });
      let asset = await backendApi.fixedAssets.create(period.id, {
        name,
        acquisitionDate: "2026-01-01",
        acquisitionCost: 120_000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 0.5,
        bookAccountId: "acct_equipment",
      });
      if (status !== "active") {
        asset = await backendApi.fixedAssets.patch(period.id, asset.id, {
          status,
          disposalDate: "2026-06-30",
          disposalPrice: status === "sold" ? 110_000 : null,
        });
      }
      const accounts = await backendApi.masterData.getBookAccounts();
      const taxCategories = await backendApi.masterData.getTaxCategories();
      const businessCategories =
        await backendApi.masterData.getBusinessCategories();
      const today = new Date(2026, 11, 31);
      const preview = buildClosingVirtualEntries({
        fiscalPeriodId: period.id,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: [],
        assets: [mapFixedAsset(asset, "工具器具備品", today, period.endDate)],
        carryovers: [],
      });
      expect(preview.every((entry) => entry.description.length <= 400)).toBe(
        true,
      );
      expect(
        preview.every(
          (entry) =>
            !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(entry.description),
        ),
      ).toBe(true);
      await backendApi.preClosings.run(period.id);
      await backendApi.closings.run(
        period.id,
        preview.map((entry) =>
          entryRecordToImportPayload(entry, {
            accounts,
            taxCategories,
            businessCategories,
          }),
        ),
      );
      const closed = await backendApi.fiscalPeriods.patch(period.id, {
        documentsReceivedCompleted: true,
      });
      const zip = createLegacyArchiveZip(
        buildFiscalPeriodArchivePayload({
          createdAt: today.toISOString(),
          fiscalPeriod: closed,
          entries: await backendApi.entries.getAll(period.id),
          fixedAssets: [asset],
          closings: archiveClosingRecords(closed),
        }),
      );
      const restoredBackendApi = createOpenkkBackendApi(
        await createMemoryDbAdapter(null),
        {
          userId: "user-1",
        },
      );
      const restored = await restoredBackendApi.fiscalPeriods.importArchived(
        readLegacyArchiveZip(zip),
      );
      const restoredAssets = await restoredBackendApi.fixedAssets.getAll(
        restored.id,
      );
      expect(restoredAssets[0]!.id).not.toBe(asset.id);
      const entries = (
        await restoredBackendApi.entries.getAll(restored.id)
      ).map((entry) =>
        entryRecord({
          ...entry,
          lines: entry.lines.map((line) => ({
            ...line,
            accountName: accounts.find(
              (account) => account.id === line.bookAccountId,
            )!.name,
            accountType: accounts.find(
              (account) => account.id === line.bookAccountId,
            )!.accountType,
            amount: String(line.amount),
            taxCategoryName: null,
            businessCategoryName: null,
          })),
        }),
      );
      const reportEntries = withClosingVirtualEntries({
        fiscalPeriodId: restored.id,
        phase: restored.phase,
        periodStartDate: restored.startDate,
        periodEndDate: restored.endDate,
        entries,
        assets: restoredAssets.map((item) =>
          mapFixedAsset(item, "工具器具備品", today, restored.endDate),
        ),
        carryovers: [],
      });

      expect(reportEntries).toEqual(entries);
      expect(
        computeFsAggregate({ entries: reportEntries, openingBalanceLines: [] }),
      ).toEqual(
        computeFsAggregate({ entries: preview, openingBalanceLines: [] }),
      );
    },
  );
});
