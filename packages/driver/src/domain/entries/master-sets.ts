import { FIRST_MASTER_SET_ID, MASTER_SETS } from "./generated-master-data.js";

export type MasterSetSummary = {
  id: string;
  name: string;
  effectiveFrom: string;
};

export const MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE = FIRST_MASTER_SET_ID;

export function masterSetForStartDate<Set extends MasterSetSummary>(
  startDate: string,
  masterSets: ReadonlyArray<Set>,
): Set | null {
  const effective = masterSets.filter(
    (masterSet) => masterSet.effectiveFrom <= startDate,
  );
  return effective[effective.length - 1] ?? masterSets[0] ?? null;
}

export function newerMasterSetFor<Set extends MasterSetSummary>(
  fiscalPeriod: { startDate: string; masterSetId: string },
  masterSets: ReadonlyArray<Set>,
): Set | null {
  const current =
    masterSets.find((masterSet) => masterSet.id === fiscalPeriod.masterSetId) ??
    null;
  const candidate = masterSetForStartDate(fiscalPeriod.startDate, masterSets);
  if (current == null || candidate == null) return null;
  return candidate.effectiveFrom > current.effectiveFrom ? candidate : null;
}

export function masterSetName(
  masterSetId: string,
  masterSets: ReadonlyArray<MasterSetSummary>,
): string {
  return (
    masterSets.find((masterSet) => masterSet.id === masterSetId)?.name ??
    masterSetId
  );
}

export const BUILT_IN_MASTER_SETS: ReadonlyArray<MasterSetSummary> =
  MASTER_SETS.map(({ id, name, effectiveFrom }) => ({
    id,
    name,
    effectiveFrom,
  }));
