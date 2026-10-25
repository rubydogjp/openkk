import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodOpeningApiRecord,
  FixedAssetApiRecord,
} from "@rubydogjp/openkk-server-ports";

const TEST_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function emptyOpening(): FiscalPeriodOpeningApiRecord {
  return { balanceLines: [], journals: [] };
}

export function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  const base: FiscalPeriodApiRecord = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: emptyOpening(),
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    archivedAt: null,
  };
  const period = Object.assign(base, overrides);
  return {
    ...period,
    opening: overrides.opening ?? emptyOpening(),
  };
}

export function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  const base: EntryApiRecord = {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: null,
    businessRate: 1,
    lines: [],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}

export function entryLinesWithIds(
  lines: EntryUpsertInput["lines"],
): EntryApiRecord["lines"] {
  return lines.map((line, index) => ({ ...line, id: `line-${index + 1}` }));
}

export function fixedAsset(
  overrides: Partial<FixedAssetApiRecord>,
): FixedAssetApiRecord {
  const base: FixedAssetApiRecord = {
    id: "asset-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    name: "asset",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 0,
    usefulLife: 0,
    depreciationMethod: "straight_line",
    businessRate: 1,
    status: "active",
    disposalDate: null,
    disposalPrice: null,
    bookAccountId: "",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}

export function changedFields<T extends object>(
  patch: T,
): {
  [K in keyof T]?: Exclude<T[K], null>;
} {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null),
  ) as { [K in keyof T]?: Exclude<T[K], null> };
}
