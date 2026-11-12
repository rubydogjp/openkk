export type OpenkkBookStorageStatus = "saved" | "saving" | "failed";

export type OpenkkBookFileSubject = {
  id: string;
  name: string;
  createdAt: string;
};

export type OpenkkBookFileState = {
  fileName: string;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  reminderDue: boolean;
};

export type OpenkkBookFileSaveResult = "saved" | "cancelled";

export type OpenkkBookImportCase =
  | "new"
  | "same"
  | "changed_outside"
  | "replaces_app_changes"
  | "changed_both"
  | "same_dates"
  | "overlapping";

export type OpenkkBookImportItem = {
  fiscalPeriodId: string;
  fiscalPeriodName: string;
  case: OpenkkBookImportCase;
  existingFiscalPeriodId: string | null;
  existingFiscalPeriodName: string | null;
};

export interface OpenkkBookImportPlan {
  readonly items: readonly OpenkkBookImportItem[];
  apply(): Promise<string[]>;
}

export type OpenkkBookFileProblem =
  "not_a_book" | "newer_version" | "no_fiscal_period" | "books_changed";

export class OpenkkBookFileError extends Error {
  readonly problem: OpenkkBookFileProblem;

  constructor(problem: OpenkkBookFileProblem) {
    super(`book file cannot be imported: ${problem}`);
    this.name = "OpenkkBookFileError";
    this.problem = problem;
  }
}

export interface OpenkkBookSaveTracking {
  readonly unreadableBookCount: number;
  getStorageStatus(): OpenkkBookStorageStatus;
  getState(fiscalPeriod: OpenkkBookFileSubject): OpenkkBookFileState | null;
  subscribe(listener: () => void): () => void;
  retryStorage(): Promise<void>;
}

export interface OpenkkBookFilesPort {
  readonly saveTracking: OpenkkBookSaveTracking | null;
  readonly reloadsAppAfterImport: boolean;
  fileNameOf(fiscalPeriodName: string): string;
  save(fiscalPeriodId: string): Promise<OpenkkBookFileSaveResult>;
  inspect(bytes: Uint8Array): Promise<OpenkkBookImportPlan>;
}
