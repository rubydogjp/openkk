import { afterEach, vi } from "vitest";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-engine";

import { runDbPortConformance } from "../../engine/test-support/db-port-conformance.js";
import { InMemoryDbWorker } from "../test-support/in-memory-db-worker.js";

async function createWorkerTransportAdapter(
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  vi.resetModules();
  vi.stubGlobal("Worker", InMemoryDbWorker);
  const { createLegacyDbAdapter } = await import("./index.js");
  return createLegacyDbAdapter(
    {
      vfsName: "opfs-conformance",
      dbFileName: "test.sqlite3",
      onWaitingForAnotherTab: null,
    },
    seed,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

runDbPortConformance("file-db-adapter (worker transport)", {
  makeAdapter: () => createWorkerTransportAdapter(null),
  makeSeededAdapter: (seed) => createWorkerTransportAdapter(seed),
});
