import { serverConflictError, serverValidationError } from "./app-error.js";
import { requireObject } from "./validation.js";

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
  patch: unknown,
): void {
  const changes = requireObject(patch, "Fiscal period patch");
  if (fiscalPeriod.phase === "pre_closing") {
    throw serverConflictError(
      `Fiscal period ${fiscalPeriod.id} cannot be updated from phase pre_closing`,
      "仮締め中の会計期間は変更できません",
    );
  }
  const changedKeys = Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (
    fiscalPeriod.phase === "post_closing" &&
    (changedKeys.length !== 1 ||
      changes.documentsReceivedCompleted !== true)
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

export type FiscalPeriodLifecycleFlags = {
  phase: FiscalPeriodRulePhase;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
};

export function assertFiscalPeriodLifecycleFlags(
  state: FiscalPeriodLifecycleFlags,
  label: string,
): void {
  if (state.settingsCompleted === (state.phase === "pre_opening")) {
    throw serverValidationError(
      state.phase === "pre_opening"
        ? `${label} pre_opening phase must not have settingsCompleted`
        : `${label} ${state.phase} phase requires settingsCompleted`,
      null,
    );
  }
  if (
    (state.phase === "pre_closing" || state.phase === "post_closing") &&
    !state.openingBalancesCompleted
  ) {
    throw serverValidationError(
      `${label} ${state.phase} phase requires completed opening balances`,
      null,
    );
  }
  if (state.documentsReceivedCompleted && state.phase !== "post_closing") {
    throw serverValidationError(
      `${label} documentsReceivedCompleted requires post_closing phase`,
      null,
    );
  }
}

export type FiscalPeriodClosingMarkers = {
  hasPreClosing: boolean;
  hasClosing: boolean;
};

export function assertFiscalPeriodClosingMarkers(
  phase: FiscalPeriodRulePhase,
  markers: FiscalPeriodClosingMarkers,
  label: string,
): void {
  if (phase === "post_closing") {
    if (markers.hasPreClosing && markers.hasClosing) return;
    throw serverValidationError(
      `${label} post_closing phase requires pre-closing and closing records`,
      null,
    );
  }
  if (phase === "pre_closing") {
    if (markers.hasPreClosing && !markers.hasClosing) return;
    throw serverValidationError(
      `${label} pre_closing phase requires only a pre-closing record`,
      null,
    );
  }
  if (markers.hasPreClosing || markers.hasClosing) {
    throw serverValidationError(
      `${label} ${phase} phase must not contain closing records`,
      null,
    );
  }
}

export type FiscalPeriodArchiveState = {
  archiveStatus: "active" | "archived";
  archiveDataAvailable: boolean;
  archivedAt: string | null;
};

export function assertFiscalPeriodArchiveState(
  state: FiscalPeriodArchiveState,
  label: string,
): void {
  if (!state.archiveDataAvailable && state.archiveStatus !== "archived") {
    throw serverValidationError(
      `${label} purged data requires archived status`,
      null,
    );
  }
  if (state.archiveStatus === "active" && state.archivedAt !== null) {
    throw serverValidationError(
      `${label} active fiscal period must not have archivedAt`,
      null,
    );
  }
}
