import { afterEach, vi } from "vitest";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-server-ports";

import { runDbPortConformance } from "../../server-ports/src/db-port-conformance.js";
import { RealDbWorker } from "./real-db-worker.js";

async function createWorkerTransportAdapter(
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  vi.resetModules();
  vi.stubGlobal("Worker", RealDbWorker);
  const { createFileDbAdapter } = await import("./index.js");
  return createFileDbAdapter(
    { vfsName: "opfs-conformance", dbFileName: null },
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
