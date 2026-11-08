import { describe, expect, it } from "vitest";
import type {
  OpenkkDocumentBackupResult,
  OpenkkDocumentSaveMode,
  OpenkkDocumentWriteResult,
} from "@rubydogjp/openkk-client-ports";

import {
  createOpenkkDocumentSession,
  DOCUMENT_BACKUP_INTERVAL_MS,
} from "./document-session.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function harness(saveMode: OpenkkDocumentSaveMode) {
  let version = 0;
  const writes: number[] = [];
  const pending: Array<ReturnType<typeof deferred<OpenkkDocumentWriteResult>>> =
    [];
  let closed = 0;
  const session = createOpenkkDocumentSession({
    sink: {
      fileName: "book.openkk",
      saveMode,
      write: (bytes) => {
        writes.push(bytes[0]!);
        const next = deferred<OpenkkDocumentWriteResult>();
        pending.push(next);
        return next.promise;
      },
    },
    exportBytes: () => new Uint8Array([version]),
    onClose: () => {
      closed += 1;
    },
    openNextBook: async () => {},
    backup: null,
    now: () => 0,
  });
  const statuses: string[] = [];
  session.subscribe(() => statuses.push(session.getStatus()));
  const change = () => {
    version += 1;
    session.notifyChanged();
  };
  const settle = async (result: OpenkkDocumentWriteResult | Error) => {
    const next = pending.shift()!;
    if (result instanceof Error) next.reject(result);
    else next.resolve(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { session, writes, statuses, change, settle, closed: () => closed };
}

describe("createOpenkkDocumentSession (auto save)", () => {
  it("writes after a change and reports saving then saved", async () => {
    const { session, writes, statuses, change, settle } = harness("auto");

    change();
    expect(session.getStatus()).toBe("saving");
    await settle("written");

    expect(writes).toEqual([1]);
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("coalesces changes made during a write into one follow-up write of the latest bytes", async () => {
    const { session, writes, change, settle } = harness("auto");

    change();
    change();
    change();
    await settle("written");
    await settle("written");

    expect(writes).toEqual([1, 3]);
    expect(session.getStatus()).toBe("saved");
  });

  it("stops autosaving once the file was changed elsewhere", async () => {
    const { session, writes, change, settle } = harness("auto");

    change();
    await settle("conflict");
    change();
    await session.save();

    expect(session.getStatus()).toBe("conflict");
    expect(writes).toEqual([1]);
  });

  it("keeps unsaved changes after a failed write and retries on save", async () => {
    const { session, writes, change, settle } = harness("auto");

    change();
    await settle(new Error("permission revoked"));
    expect(session.getStatus()).toBe("failed");
    const retry = session.save();
    await settle("written");
    await retry;

    expect(writes).toEqual([1, 1]);
    expect(session.getStatus()).toBe("saved");
  });

  it("waits for an in-flight write before closing", async () => {
    const { session, change, settle, closed } = harness("auto");

    change();
    const closing = session.close();
    expect(closed()).toBe(0);
    await settle("written");
    await closing;

    expect(closed()).toBe(1);
  });
});

describe("createOpenkkDocumentSession (download)", () => {
  it("marks changes unsaved and writes only when saved explicitly", async () => {
    const { session, writes, change, settle } = harness("download");

    change();
    change();
    expect(session.getStatus()).toBe("unsaved");
    expect(writes).toEqual([]);
    const saving = session.save();
    await settle("written");
    await saving;

    expect(writes).toEqual([2]);
    expect(session.getStatus()).toBe("saved");
  });
});

describe("createOpenkkDocumentSession (backup)", () => {
  function backupHarness(input: {
    firstOpenedAt: number;
    lastSavedAt: number | null;
    result: OpenkkDocumentBackupResult;
  }) {
    let now = DOCUMENT_BACKUP_INTERVAL_MS * 2;
    const backups: Array<{ bytes: number; savedAt: number }> = [];
    const session = createOpenkkDocumentSession({
      sink: {
        fileName: "book.openkk",
        saveMode: "auto",
        write: async () => "written",
      },
      exportBytes: () => new Uint8Array([7]),
      onClose: () => {},
      openNextBook: async () => {},
      backup: {
        firstOpenedAt: input.firstOpenedAt,
        lastSavedAt: input.lastSavedAt,
        write: async (bytes, savedAt) => {
          backups.push({ bytes: bytes[0]!, savedAt });
          return input.result;
        },
      },
      now: () => now,
    });
    return {
      session,
      backup: session.backup!,
      backups,
      advance: (milliseconds: number) => {
        now += milliseconds;
      },
    };
  }

  it("asks for a backup only after the book changes and the interval has passed", () => {
    const { session, backup, advance } = backupHarness({
      firstOpenedAt: DOCUMENT_BACKUP_INTERVAL_MS,
      lastSavedAt: null,
      result: "saved",
    });
    let notified = 0;
    session.subscribe(() => {
      notified += 1;
    });

    expect(backup.isDue()).toBe(false);
    session.notifyChanged();
    expect(notified).toBeGreaterThan(0);
    expect(backup.isDue()).toBe(true);
    advance(-1);
    expect(backup.isDue()).toBe(false);
  });

  it("remembers when the backup was saved, but not when it was cancelled", async () => {
    const saved = backupHarness({
      firstOpenedAt: 0,
      lastSavedAt: null,
      result: "saved",
    });
    saved.session.notifyChanged();
    await saved.backup.save();

    expect(saved.backups).toEqual([
      { bytes: 7, savedAt: DOCUMENT_BACKUP_INTERVAL_MS * 2 },
    ]);
    expect(saved.backup.getLastSavedAt()).toBe(DOCUMENT_BACKUP_INTERVAL_MS * 2);
    expect(saved.backup.isDue()).toBe(false);

    const cancelled = backupHarness({
      firstOpenedAt: 0,
      lastSavedAt: 5,
      result: "cancelled",
    });
    cancelled.session.notifyChanged();
    await cancelled.backup.save();

    expect(cancelled.backup.getLastSavedAt()).toBe(5);
    expect(cancelled.backup.isDue()).toBe(true);
  });
});
