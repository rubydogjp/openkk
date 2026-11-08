import type {
  FiscalPeriodCarryoverFromArchiveApplyInput,
  FiscalPeriodCreateInput,
} from "../backend-api/types.js";

export type OpenkkDocumentSaveMode = "auto" | "download";

export type OpenkkDocumentSaveStatus =
  "saved" | "saving" | "unsaved" | "conflict" | "failed";

export type OpenkkNextBookInput = {
  fileName: string;
  fiscalPeriod: FiscalPeriodCreateInput;
  carryover: FiscalPeriodCarryoverFromArchiveApplyInput;
};

export interface OpenkkDocumentPort {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  getStatus(): OpenkkDocumentSaveStatus;
  subscribe(listener: () => void): () => void;
  save(): Promise<void>;
  close(): Promise<void>;
  openNextBook(input: OpenkkNextBookInput): Promise<void>;
}

export type OpenkkDocumentWriteResult = "written" | "conflict";

export interface OpenkkDocumentSink {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  write(bytes: Uint8Array): Promise<OpenkkDocumentWriteResult>;
}
