import { serverConflictError } from "./app-error.js";

export type FiscalPeriodRulePhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

const PATCHABLE_KEYS_BY_PHASE: Record<
  FiscalPeriodRulePhase,
  ReadonlySet<string>
> = {
  pre_opening: new Set([
    "name",
    "startDate",
    "endDate",
    "settingsCompleted",
    "openingBalancesCompleted",
    "opening",
  ]),
  journalizing: new Set(["openingBalancesCompleted", "opening"]),
  pre_closing: new Set(),
  post_closing: new Set(["documentsReceivedCompleted"]),
};

export function assertFiscalPeriodPatchMatchesPhase(
  fiscalPeriod: { id: string; phase: FiscalPeriodRulePhase },
  patch: object,
): void {
  if (fiscalPeriod.phase === "pre_closing") {
    throw serverConflictError(
      `Fiscal period ${fiscalPeriod.id} cannot be updated from phase pre_closing`,
      "仮締め中の会計期間は変更できません",
    );
  }
  const changedKeys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (
    fiscalPeriod.phase === "post_closing" &&
    (changedKeys.length !== 1 ||
      (patch as { documentsReceivedCompleted: unknown })
        .documentsReceivedCompleted !== true)
  ) {
    throw serverConflictError(
      `Fiscal period ${fiscalPeriod.id} only allows document receipt completion after closing`,
      "本締め後は書類受領の完了以外を変更できません",
    );
  }
  const lockedKey = changedKeys.find(
    (key) => !PATCHABLE_KEYS_BY_PHASE[fiscalPeriod.phase].has(key),
  );
  if (lockedKey != null) {
    throw serverConflictError(
      `Fiscal period ${fiscalPeriod.id} cannot update ${lockedKey} from phase ${fiscalPeriod.phase}`,
      "開始後は会計期間の設定を変更できません",
    );
  }
}
