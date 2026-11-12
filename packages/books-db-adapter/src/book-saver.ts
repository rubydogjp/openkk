export type BookSaveStatus = "saved" | "saving" | "failed";

export type BookSaver = {
  status(): BookSaveStatus;
  markChanged(): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
  resume(): void;
};

export function createBookSaver(options: {
  exportBytes(): Promise<Uint8Array | null>;
  write(bytes: Uint8Array): Promise<void>;
  onStatusChange(): void;
  onError(error: unknown): void;
}): BookSaver {
  let dirty = false;
  let failed = false;
  let stopped = false;
  let running: Promise<void> | null = null;
  let writing: Promise<void> | null = null;

  async function writeLatest(): Promise<void> {
    while (dirty && !stopped) {
      dirty = false;
      try {
        const bytes = await options.exportBytes();
        if (bytes == null || stopped) return;
        writing = options.write(bytes);
        await writing;
        failed = false;
      } catch (error) {
        dirty = true;
        failed = true;
        options.onError(error);
        return;
      } finally {
        writing = null;
      }
    }
  }

  function run(): Promise<void> {
    if (running != null) return running;
    failed = false;
    const started = writeLatest().finally(() => {
      running = null;
      options.onStatusChange();
    });
    running = started;
    options.onStatusChange();
    return started;
  }

  return {
    status() {
      if (stopped) return "saved";
      if (running != null) return "saving";
      if (failed) return "failed";
      return dirty ? "saving" : "saved";
    },
    markChanged() {
      if (stopped) return;
      dirty = true;
      void run();
    },
    async flush() {
      while (!stopped && (dirty || running != null)) {
        await run();
        if (failed) throw new Error("the book could not be saved");
      }
    },
    async stop() {
      stopped = true;
      if (writing != null) await writing.catch(() => {});
    },
    resume() {
      stopped = false;
      dirty = true;
      void run();
    },
  };
}
