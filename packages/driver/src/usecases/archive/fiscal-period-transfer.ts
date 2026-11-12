import {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
  type FiscalPeriodPhase,
} from "../../domain/index.js";
import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "../../ports/index.js";

export type FiscalPeriodArchiveSubject = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodPhase;
} & Record<string, unknown>;

export async function buildFiscalPeriodArchiveZip(
  backend: OpenkkBackendPort,
  fiscalPeriod: FiscalPeriodArchiveSubject,
  createdAt: Date,
  afterBackendCall: () => void,
): Promise<Uint8Array> {
  const [entries, fixedAssets] = await Promise.all([
    backend.entries.getAll(fiscalPeriod.id),
    backend.fixedAssets.getAll(fiscalPeriod.id),
  ]);
  afterBackendCall();
  return createFiscalPeriodArchiveZip(
    buildFiscalPeriodArchivePayload({
      createdAt: createdAt.toISOString(),
      fiscalPeriod: { ...fiscalPeriod, archiveStatus: "archived" },
      entries: entries.map((entry) => ({ ...entry })),
      fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
      closings: archiveClosingRecords(fiscalPeriod),
    }),
  );
}

export async function carryOverFromBackend(
  source: OpenkkBackendPort,
  sourcePeriod: FiscalPeriodApiRecord,
  target: OpenkkBackendPort,
  targetPeriodId: string,
  createdAt: Date,
): Promise<FiscalPeriodApiRecord> {
  const zip = await buildFiscalPeriodArchiveZip(
    source,
    sourcePeriod,
    createdAt,
    () => {},
  );
  return target.fiscalPeriods.applyCarryoverFromArchive(targetPeriodId, {
    archive: readFiscalPeriodArchiveZip(zip),
    carryBalances: true,
    reversalEntryIndexes: null,
    carryFixedAssets: true,
  });
}

export async function copyFiscalPeriodToBackend(
  source: OpenkkBackendPort,
  period: FiscalPeriodApiRecord,
  target: OpenkkBackendPort,
  createdAt: Date,
): Promise<FiscalPeriodApiRecord> {
  const zip = await buildFiscalPeriodArchiveZip(
    source,
    period,
    createdAt,
    () => {},
  );
  return target.fiscalPeriods.importArchived(readFiscalPeriodArchiveZip(zip));
}
