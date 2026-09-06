import { afterEach, vi } from "vitest";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-server-ports";

import { runDbPortConformance } from "../../server-ports/src/db-port-conformance.js";
import { RealDbWorker } from "./real-db-worker.js";

async function createWorkerTransportAdapter(
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  vi.resetModules();
  vi.stubGlobal("Worker", RealDbWorker);
  const { createFileDbAdapter } = await import("./index.js");
  return createFileDbAdapter({ vfsName: "opfs-conformance" }, seed);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

runDbPortConformance("file-db-adapter (worker transport)", {
  makeAdapter: () => createWorkerTransportAdapter(),
  makeSeededAdapter: (seed) => createWorkerTransportAdapter(seed),
});
