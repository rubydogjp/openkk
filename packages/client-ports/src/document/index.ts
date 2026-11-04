export type OpenkkDocumentSaveMode = "auto" | "download";

export type OpenkkDocumentSaveStatus =
  "saved" | "saving" | "unsaved" | "conflict" | "failed";

export interface OpenkkDocumentPort {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  getStatus(): OpenkkDocumentSaveStatus;
  subscribe(listener: () => void): () => void;
  save(): Promise<void>;
  close(): Promise<void>;
}

export type OpenkkDocumentWriteResult = "written" | "conflict";

export interface OpenkkDocumentSink {
  readonly fileName: string;
  readonly saveMode: OpenkkDocumentSaveMode;
  write(bytes: Uint8Array): Promise<OpenkkDocumentWriteResult>;
}
