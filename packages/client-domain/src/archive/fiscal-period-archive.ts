import { AppError } from "../shared/app-error.js";
import {
  assertFiscalPeriodArchiveByteLength,
  createStoredZip,
  invalidArchiveContentError,
  MAX_FISCAL_PERIOD_ARCHIVE_BYTES,
  readStoredZip,
  type ArchiveZipFile,
} from "./fiscal-period-archive-zip.js";

export { assertFiscalPeriodArchiveByteLength, MAX_FISCAL_PERIOD_ARCHIVE_BYTES };

export const FISCAL_PERIOD_ARCHIVE_FORMAT = "openkk.fiscal-period-archive";
export const FISCAL_PERIOD_ARCHIVE_VERSION = 1;

export type FiscalPeriodArchiveManifest = {
  format: typeof FISCAL_PERIOD_ARCHIVE_FORMAT;
  version: typeof FISCAL_PERIOD_ARCHIVE_VERSION;
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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

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

export function createFiscalPeriodArchiveZip(
  payload: FiscalPeriodArchivePayload,
): Uint8Array {
  assertFiscalPeriodArchivePayload(payload);
  return createStoredZip([
    jsonFile("manifest.json", payload.manifest),
    jsonFile("fiscal-period.json", payload.fiscalPeriod),
    jsonFile("entries.json", payload.entries),
    jsonFile("fixed-assets.json", payload.fixedAssets),
    jsonFile("closings.json", payload.closings),
  ]);
}

export function readFiscalPeriodArchiveZip(
  bytes: Uint8Array,
): FiscalPeriodArchivePayload {
  const files = readStoredZip(bytes);
  const payload: FiscalPeriodArchivePayload = {
    manifest: readJsonFile(files, "manifest.json"),
    fiscalPeriod: readJsonFile(files, "fiscal-period.json"),
    entries: readJsonFile(files, "entries.json"),
    fixedAssets: readJsonFile(files, "fixed-assets.json"),
    closings: readJsonFile(files, "closings.json"),
  };
  assertFiscalPeriodArchivePayload(payload);
  return payload;
}

export function buildFiscalPeriodArchiveFilename(input: {
  name: string;
  startDate: string;
  endDate: string;
}): string {
  const safeName = input.name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const base = safeName.length > 0 ? safeName : "fiscal-period";
  return `${base}_${input.startDate}_${input.endDate}.zip`;
}

function jsonFile(name: string, value: unknown): ArchiveZipFile {
  return {
    name,
    bytes: textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`),
  };
}

function readJsonFile<T>(files: Map<string, Uint8Array>, name: string): T {
  const bytes = files.get(name);
  if (bytes == null) {
    throw invalidArchiveContentError(`archive file missing: ${name}`);
  }
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } catch (error) {
    throw new AppError({
      messageForDeveloper: `archive json parse failed: ${name}`,
      messageForUser:
        "圧縮済みファイル内のデータ形式を確認できませんでした。別のファイルを選択してください。",
      originalMessage: error instanceof Error ? error.message : String(error),
      statusCode: null,
    });
  }
}

function assertFiscalPeriodArchivePayload(
  payload: FiscalPeriodArchivePayload,
): void {
  if (payload.manifest?.format !== FISCAL_PERIOD_ARCHIVE_FORMAT) {
    throw invalidArchiveContentError("archive manifest format is invalid");
  }
  if (payload.manifest.version !== FISCAL_PERIOD_ARCHIVE_VERSION) {
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
