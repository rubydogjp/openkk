import type {
  EntryApiRecord,
  FiscalPeriodApiRecord,
  FiscalPeriodCarryoverFromArchiveApplyInput,
  FiscalPeriodCreateInput,
  FixedAssetApiRecord,
} from "../backend-api/types.js";

export type OpenkkDocumentSaveMode = "auto" | "download";

export type OpenkkDocumentSaveStatus =
  "saved" | "saving" | "unsaved" | "conflict" | "failed";

export type OpenkkNextBookInput = {
  fileName: string;
  fiscalPeriod: FiscalPeriodCreateInput;
  carryover: FiscalPeriodCarryoverFromArchiveApplyInput;
};

export type OpenkkOtherBookRecords = {
  entries: EntryApiRecord[];
  fixedAssets: FixedAssetApiRecord[];
};

export type OpenkkOtherBookPeriod = {
  bookName: string;
  fiscalPeriod: FiscalPeriodApiRecord;
  readRecords(): Promise<OpenkkOtherBookRecords>;
};

export interface OpenkkDocumentBackup {
  getLastSavedAt(): number | null;
  isDue(): boolean;
  save(): Promise<void>;
}

export interface OpenkkDocumentPort {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  readonly backup: OpenkkDocumentBackup | null;
  getStatus(): OpenkkDocumentSaveStatus;
  subscribe(listener: () => void): () => void;
  save(): Promise<void>;
  close(): Promise<void>;
  openNextBook(input: OpenkkNextBookInput): Promise<void>;
  readOtherBookPeriods(): Promise<OpenkkOtherBookPeriod[]>;
}

export type OpenkkDocumentWriteResult = "written" | "conflict";

export interface OpenkkDocumentSink {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  write(bytes: Uint8Array): Promise<OpenkkDocumentWriteResult>;
}

export type OpenkkDocumentBackupResult = "saved" | "cancelled";

export interface OpenkkDocumentBackupSink {
  readonly firstOpenedAt: number;
  readonly lastSavedAt: number | null;
  write(
    bytes: Uint8Array,
    savedAt: number,
  ): Promise<OpenkkDocumentBackupResult>;
}
