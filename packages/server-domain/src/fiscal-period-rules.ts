import { serverConflictError, serverValidationError } from "./app-error.js";
import type {
  FiscalPeriodArchiveStatus,
  FiscalPeriodPhase,
} from "./models.js";
import { requireObject } from "./validation.js";

export const FISCAL_PERIOD_PATCH_KEYS = [
  "name",
  "startDate",
  "endDate",
  "openingBalancesCompleted",
  "documentsReceivedCompleted",
  "opening",
] as const;

const PATCHABLE_KEYS_BY_PHASE: Record<
  FiscalPeriodPhase,
  ReadonlySet<string>
> = {
  pre_opening: new Set([
    "name",
    "startDate",
    "endDate",
    "openingBalancesCompleted",
    "opening",
  ]),
  journalizing: new Set(["openingBalancesCompleted", "opening"]),
  pre_closing: new Set(),
  post_closing: new Set(["documentsReceivedCompleted"]),
};

export function assertFiscalPeriodPatchMatchesPhase(
  fiscalPeriod: { id: string; phase: FiscalPeriodPhase },
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
  phase: FiscalPeriodPhase;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
};

export function assertFiscalPeriodLifecycleFlags(
  state: FiscalPeriodLifecycleFlags,
  label: string,
): void {
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
  phase: FiscalPeriodPhase,
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
  archiveStatus: FiscalPeriodArchiveStatus;
  archivedAt: string | null;
};

export function assertFiscalPeriodArchiveState(
  state: FiscalPeriodArchiveState,
  label: string,
): void {
  if (state.archiveStatus === "active" && state.archivedAt !== null) {
    throw serverValidationError(
      `${label} active fiscal period must not have archivedAt`,
      null,
    );
  }
}
