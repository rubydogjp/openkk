import {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  type FiscalPeriodArchivePayload,
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

export async function loadFiscalPeriodArchivePayload(
  backend: OpenkkBackendPort,
  fiscalPeriod: FiscalPeriodArchiveSubject,
  createdAt: Date,
  afterBackendCall: () => void,
): Promise<FiscalPeriodArchivePayload> {
  const [entries, fixedAssets] = await Promise.all([
    backend.entries.getAll(fiscalPeriod.id),
    backend.fixedAssets.getAll(fiscalPeriod.id),
  ]);
  afterBackendCall();
  return buildFiscalPeriodArchivePayload({
    createdAt: createdAt.toISOString(),
    fiscalPeriod: { ...fiscalPeriod, archiveStatus: "archived" },
    entries: entries.map((entry) => ({ ...entry })),
    fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
    closings: archiveClosingRecords(fiscalPeriod),
  });
}

const NO_AUTH_CHECK = () => {};

export async function carryOverFromBackend(
  source: OpenkkBackendPort,
  sourcePeriod: FiscalPeriodApiRecord,
  target: OpenkkBackendPort,
  targetPeriodId: string,
  createdAt: Date,
): Promise<FiscalPeriodApiRecord> {
  return target.fiscalPeriods.applyCarryoverFromArchive(targetPeriodId, {
    archive: await loadFiscalPeriodArchivePayload(
      source,
      sourcePeriod,
      createdAt,
      NO_AUTH_CHECK,
    ),
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
  return target.fiscalPeriods.importArchived(
    await loadFiscalPeriodArchivePayload(
      source,
      period,
      createdAt,
      NO_AUTH_CHECK,
    ),
  );
}
