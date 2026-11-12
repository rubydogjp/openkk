import {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} from "@rubydogjp/openkk-driver";
import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-driver";

export async function buildFiscalPeriodArchiveZipFromBook(
  api: OpenkkBackendPort,
  period: FiscalPeriodApiRecord,
  createdAt: Date,
): Promise<Uint8Array> {
  const [entries, fixedAssets] = await Promise.all([
    api.entries.getAll(period.id),
    api.fixedAssets.getAll(period.id),
  ]);
  return createFiscalPeriodArchiveZip(
    buildFiscalPeriodArchivePayload({
      createdAt: createdAt.toISOString(),
      fiscalPeriod: { ...period, archiveStatus: "archived" },
      entries: entries.map((entry) => ({ ...entry })),
      fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
      closings: archiveClosingRecords(period),
    }),
  );
}

export async function carryOverFromBook(
  source: OpenkkBackendPort,
  sourcePeriod: FiscalPeriodApiRecord,
  target: OpenkkBackendPort,
  targetPeriodId: string,
  createdAt: Date,
): Promise<FiscalPeriodApiRecord> {
  const zip = await buildFiscalPeriodArchiveZipFromBook(
    source,
    sourcePeriod,
    createdAt,
  );
  return target.fiscalPeriods.applyCarryoverFromArchive(targetPeriodId, {
    archive: readFiscalPeriodArchiveZip(zip),
    carryBalances: true,
    reversalEntryIndexes: null,
    carryFixedAssets: true,
  });
}

export async function copyFiscalPeriodToBook(
  source: OpenkkBackendPort,
  period: FiscalPeriodApiRecord,
  target: OpenkkBackendPort,
  createdAt: Date,
): Promise<FiscalPeriodApiRecord> {
  const zip = await buildFiscalPeriodArchiveZipFromBook(
    source,
    period,
    createdAt,
  );
  return target.fiscalPeriods.importArchived(readFiscalPeriodArchiveZip(zip));
}
