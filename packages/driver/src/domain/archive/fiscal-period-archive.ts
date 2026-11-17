import type { FiscalPeriodPhase } from "../shared/models.js";
import { invalidArchiveContentError } from "./fiscal-period-archive-limits.js";

export const FISCAL_PERIOD_ARCHIVE_FORMAT = "openkk.fiscal-period-archive";
export const FISCAL_PERIOD_ARCHIVE_VERSION = 2;

export type FiscalPeriodArchiveVersion = 1 | 2;

export type FiscalPeriodArchiveManifest = {
  format: typeof FISCAL_PERIOD_ARCHIVE_FORMAT;
  version: FiscalPeriodArchiveVersion;
  createdAt: string;
  fiscalPeriodId: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodArchivePayload = {
  manifest: FiscalPeriodArchiveManifest;
  fiscalPeriod: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
};

export function buildFiscalPeriodArchivePayload(input: {
  createdAt: string;
  fiscalPeriod: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } & Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
}): FiscalPeriodArchivePayload {
  return {
    manifest: {
      format: FISCAL_PERIOD_ARCHIVE_FORMAT,
      version: FISCAL_PERIOD_ARCHIVE_VERSION,
      createdAt: input.createdAt,
      fiscalPeriodId: input.fiscalPeriod.id,
      name: input.fiscalPeriod.name,
      startDate: input.fiscalPeriod.startDate,
      endDate: input.fiscalPeriod.endDate,
    },
    fiscalPeriod: { ...input.fiscalPeriod },
    entries: input.entries.map((entry) => ({ ...entry })),
    fixedAssets: input.fixedAssets.map((asset) => ({ ...asset })),
    closings: input.closings.map((closing) => ({ ...closing })),
  };
}

export function archiveClosingRecords(fiscalPeriod: {
  id: string;
  endDate: string;
  phase: FiscalPeriodPhase;
}): Array<Record<string, unknown>> {
  const record = (kind: "pre_closing" | "closing") => ({
    fiscalPeriodId: fiscalPeriod.id,
    year: Number(fiscalPeriod.endDate.slice(0, 4)),
    kind,
  });
  if (fiscalPeriod.phase === "post_closing") {
    return [record("pre_closing"), record("closing")];
  }
  return fiscalPeriod.phase === "pre_closing" ? [record("pre_closing")] : [];
}

export const OPENKK_BOOK_FILE_EXTENSION = ".openkk";

const UNSAFE_FILE_NAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const MAX_FILE_NAME_STEM_LENGTH = 80;
const EMPTY_BOOK_FILE_NAME_STEM = "帳簿";
const EMPTY_PERIOD_FILE_NAME_STEM = "会計期間";

function trimFileNameStem(value: string): string {
  return value
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
}

export function fileNameStem(name: string, fallback: string): string {
  const safe = trimFileNameStem(name.replace(UNSAFE_FILE_NAME_CHARACTERS, "_"));
  const limited = trimFileNameStem(
    Array.from(safe).slice(0, MAX_FILE_NAME_STEM_LENGTH).join(""),
  );
  return limited === "" ? fallback : limited;
}

export function buildFiscalPeriodJournalFilename(
  input: { name: string },
  extension: "csv" | "json",
): string {
  return `${fileNameStem(input.name, EMPTY_PERIOD_FILE_NAME_STEM)}_仕訳.${extension}`;
}

export function buildFiscalPeriodBookFilename(input: { name: string }): string {
  return `${fileNameStem(input.name, EMPTY_BOOK_FILE_NAME_STEM)}${OPENKK_BOOK_FILE_EXTENSION}`;
}

export function assertFiscalPeriodArchivePayload(
  payload: FiscalPeriodArchivePayload,
): void {
  if (payload.manifest?.format !== FISCAL_PERIOD_ARCHIVE_FORMAT) {
    throw invalidArchiveContentError("archive manifest format is invalid");
  }
  if (
    payload.manifest.version !== 1 &&
    payload.manifest.version !== FISCAL_PERIOD_ARCHIVE_VERSION
  ) {
    throw invalidArchiveContentError(
      "archive manifest version is not supported",
    );
  }
  if (typeof payload.manifest.fiscalPeriodId !== "string") {
    throw invalidArchiveContentError(
      "archive manifest fiscalPeriodId is invalid",
    );
  }
  if (
    typeof payload.fiscalPeriod?.id === "string" &&
    payload.fiscalPeriod.id !== payload.manifest.fiscalPeriodId
  ) {
    throw invalidArchiveContentError(
      "archive fiscalPeriod id does not match manifest",
    );
  }
  if (!Array.isArray(payload.entries)) {
    throw invalidArchiveContentError("archive entries must be an array");
  }
  if (!Array.isArray(payload.fixedAssets)) {
    throw invalidArchiveContentError("archive fixedAssets must be an array");
  }
  if (!Array.isArray(payload.closings)) {
    throw invalidArchiveContentError("archive closings must be an array");
  }
}
