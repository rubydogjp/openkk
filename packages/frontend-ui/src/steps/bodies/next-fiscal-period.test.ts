import { describe, expect, it } from "vitest";

import { backupFileHint } from "./next-fiscal-period.js";

describe("backupFileHint", () => {
  it("says the backup can be taken back in only where the books are kept as files", () => {
    expect(backupFileHint("2026年分.openkk", true)).toContain(
      "期間の選択の「ファイル」から取り込めます",
    );
    expect(backupFileHint("2026年分.openkk", false)).toBe(
      "この会計期間のデータを、ファイル (2026年分.openkk) として手元に残せます。",
    );
  });
});
