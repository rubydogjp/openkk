import type {
  OpenkkDocumentBackupResult,
  OpenkkDocumentBackupSink,
  PlatformKeyValueStorage,
} from "@rubydogjp/openkk-client-ports";

import { OPENKK_DOCUMENT_MIME_TYPE } from "./documents.js";
import { browserFiles } from "./files.js";
import { browserStorage } from "./storage.js";

const BACKUP_RECORD_KEY_PREFIX = "openkk.book-backup:";

type BackupRecord = { firstOpenedAt: number; lastSavedAt: number | null };

export type BookBackups = {
  sinkFor(fileName: string): OpenkkDocumentBackupSink;
  forget(fileName: string): void;
};

export type BookBackupsDependencies = {
  storage: PlatformKeyValueStorage;
  now: () => number;
  deliver(
    bytes: Uint8Array,
    fileName: string,
  ): Promise<OpenkkDocumentBackupResult>;
};

function readRecord(text: string | null): BackupRecord | null {
  if (text == null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed == null) return null;
    const { firstOpenedAt, lastSavedAt } = parsed as Record<string, unknown>;
    if (typeof firstOpenedAt !== "number") return null;
    return {
      firstOpenedAt,
      lastSavedAt: typeof lastSavedAt === "number" ? lastSavedAt : null,
    };
  } catch {
    return null;
  }
}

export function createBookBackups(
  dependencies: BookBackupsDependencies,
): BookBackups {
  const keyFor = (fileName: string) => `${BACKUP_RECORD_KEY_PREFIX}${fileName}`;
  return {
    sinkFor(fileName) {
      const key = keyFor(fileName);
      const record = readRecord(dependencies.storage.getItem(key)) ?? {
        firstOpenedAt: dependencies.now(),
        lastSavedAt: null,
      };
      dependencies.storage.setItem(key, JSON.stringify(record));
      return {
        firstOpenedAt: record.firstOpenedAt,
        lastSavedAt: record.lastSavedAt,
        async write(bytes, savedAt) {
          const result = await dependencies.deliver(bytes, fileName);
          if (result === "saved") {
            dependencies.storage.setItem(
              key,
              JSON.stringify({
                firstOpenedAt: record.firstOpenedAt,
                lastSavedAt: savedAt,
              }),
            );
          }
          return result;
        },
      };
    },
    forget(fileName) {
      dependencies.storage.removeItem(keyFor(fileName));
    },
  };
}

function prefersShareSheet(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

async function shareOrDownload(
  bytes: Uint8Array,
  fileName: string,
): Promise<OpenkkDocumentBackupResult> {
  const file = new File([new Uint8Array(bytes)], fileName, {
    type: OPENKK_DOCUMENT_MIME_TYPE,
  });
  if (prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      throw error;
    }
  }
  browserFiles.save(bytes, fileName, OPENKK_DOCUMENT_MIME_TYPE);
  return "saved";
}

export const bookBackups = createBookBackups({
  storage: browserStorage,
  now: () => Date.now(),
  deliver: shareOrDownload,
});
