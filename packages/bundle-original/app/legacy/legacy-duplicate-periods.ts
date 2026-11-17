export type LegacyPeriodContent = {
  fiscalPeriod: {
    id: string;
    name: string;
    userId: string;
    startDate: string;
    endDate: string;
    archiveStatus: string;
    createdAt: string;
  };
  entries: ReadonlyArray<object>;
  fixedAssets: ReadonlyArray<object>;
};

export type LegacyDuplicatePeriods<Period> = {
  kept: Period[];
  merged: Period[];
};

const IDENTITY_AND_TIME_FIELDS = new Set([
  "id",
  "userId",
  "fiscalPeriodId",
  "createdAt",
  "updatedAt",
  "archivedAt",
]);
const ARCHIVED = "archived";
const ACTIVE = "active";

function withoutIdentityAndTime(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIdentityAndTime);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !IDENTITY_AND_TIME_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, withoutIdentityAndTime(item)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(withoutIdentityAndTime(value));
}

function canonicalSet(items: ReadonlyArray<object>): string[] {
  return items.map(canonicalJson).sort();
}

function canonicalContent(period: LegacyPeriodContent): string {
  const { archiveStatus } = period.fiscalPeriod;
  return JSON.stringify({
    fiscalPeriod: canonicalJson({
      ...period.fiscalPeriod,
      archiveStatus: archiveStatus === ARCHIVED ? ACTIVE : archiveStatus,
    }),
    entries: canonicalSet(period.entries),
    fixedAssets: canonicalSet(period.fixedAssets),
  });
}

export function isSameLegacyPeriodContent(
  left: LegacyPeriodContent,
  right: LegacyPeriodContent,
): boolean {
  return canonicalContent(left) === canonicalContent(right);
}

function keepFirst(
  left: LegacyPeriodContent,
  right: LegacyPeriodContent,
): number {
  const leftArchived = left.fiscalPeriod.archiveStatus === ARCHIVED;
  const rightArchived = right.fiscalPeriod.archiveStatus === ARCHIVED;
  if (leftArchived !== rightArchived) return leftArchived ? -1 : 1;
  return left.fiscalPeriod.createdAt.localeCompare(
    right.fiscalPeriod.createdAt,
  );
}

function sameDatesKey(period: LegacyPeriodContent): string {
  const { userId, startDate, endDate } = period.fiscalPeriod;
  return JSON.stringify([userId, startDate, endDate]);
}

export function mergeLegacyDuplicatePeriods<Period extends LegacyPeriodContent>(
  periods: readonly Period[],
): LegacyDuplicatePeriods<Period> {
  const groups = new Map<string, Period[]>();
  for (const period of periods) {
    const key = sameDatesKey(period);
    groups.set(key, [...(groups.get(key) ?? []), period]);
  }
  const mergedIds = new Set<string>();
  const merged: Period[] = [];
  for (const group of groups.values()) {
    const kept: Period[] = [];
    for (const period of [...group].sort(keepFirst)) {
      if (kept.some((other) => isSameLegacyPeriodContent(other, period))) {
        mergedIds.add(period.fiscalPeriod.id);
        merged.push(period);
      } else {
        kept.push(period);
      }
    }
  }
  return {
    kept: periods.filter((period) => !mergedIds.has(period.fiscalPeriod.id)),
    merged,
  };
}
