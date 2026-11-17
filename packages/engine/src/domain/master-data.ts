import {
  FIRST_MASTER_SET_ID,
  MASTER_SETS,
  type DefaultBookAccount,
  type MasterSet,
} from "./generated-master-data.js";
import { engineValidationError } from "./app-error.js";

export * from "./generated-master-data.js";

export const MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE = FIRST_MASTER_SET_ID;

const KNOWN_BOOK_ACCOUNT_BY_ID = new Map<string, DefaultBookAccount>(
  MASTER_SETS.flatMap((masterSet) =>
    masterSet.bookAccounts.map((account) => [account.id, account] as const),
  ),
);

export function getDefaultBookAccount(id: string): DefaultBookAccount | null {
  return KNOWN_BOOK_ACCOUNT_BY_ID.get(id) ?? null;
}

export function findMasterSet(id: string): MasterSet | null {
  return MASTER_SETS.find((masterSet) => masterSet.id === id) ?? null;
}

export function masterSetOnDate<Set extends { effectiveFrom: string }>(
  startDate: string,
  masterSets: ReadonlyArray<Set>,
): Set | null {
  const effective = masterSets.filter(
    (masterSet) => masterSet.effectiveFrom <= startDate,
  );
  return effective[effective.length - 1] ?? masterSets[0] ?? null;
}

export function masterSetForStartDate(startDate: string): MasterSet {
  return masterSetOnDate(startDate, MASTER_SETS) ?? MASTER_SETS[0]!;
}

export function assertKnownMasterSetId(id: unknown): asserts id is string {
  if (typeof id !== "string" || findMasterSet(id) == null) {
    throw engineValidationError(
      `Unknown master set: ${String(id)}`,
      "この版の科目と区分は、このアプリにはありません",
    );
  }
}
