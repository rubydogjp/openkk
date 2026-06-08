import { afterEach, vi } from "vitest";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-server-ports";

import { runDbPortConformance } from "../../server-ports/src/db-port-conformance";
import { RealDbWorker } from "./real-db-worker";

// file-db-adapter を実トランスポート（Worker メッセージ往復 → sqlite-wasm）で
// 共有契約スイートに通す。Node では OPFS が使えないため Worker を RealDbWorker
// （:memory: で実 SQL を実行）に差し替えるが、createWorkerSqlDb の往復・初期化・
// createSqliteDbAdapter は本物の経路を通る。createFileDbAdapter は
// モジュール内 singleton をキャッシュするため、毎回モジュールをリセットして
// 独立した DB を得る。
async function makeFileDbAdapter(seed?: DbSnapshot): Promise<OpenkkDbPort> {
  vi.resetModules();
  vi.stubGlobal("Worker", RealDbWorker);
  const { createFileDbAdapter } = await import("./index");
  return createFileDbAdapter({ vfsName: "opfs-conformance" }, seed);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

runDbPortConformance("file-db-adapter (worker transport)", {
  makeAdapter: () => makeFileDbAdapter(),
  makeSeededAdapter: (seed) => makeFileDbAdapter(seed),
});
