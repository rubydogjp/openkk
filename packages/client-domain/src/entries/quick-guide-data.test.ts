import { describe, expect, it } from "vitest";

import { DEFAULT_BOOK_ACCOUNTS } from "./default-master-data";
import {
  guideOptions,
  guideTitle,
  resolveBookAccountByName,
  type QuickGuidePage,
} from "./quick-guide-data";

describe("quick guide data", () => {
  it("does not expose unresolved fallback text", () => {
    const pages = collectReachablePages();

    for (const page of pages) {
      expect(guideTitle(page)).not.toContain("未対応");
      expect(
        guideOptions(page).some((option) => option.title.includes("未対応")),
      ).toBe(false);
    }
  });

  it("uses account names that resolve to default master data", () => {
    for (const page of collectReachablePages()) {
      for (const option of guideOptions(page)) {
        if (option.template == null) continue;

        expect(
          resolveAccountName(option.template.debitAccountName),
        ).toBeTruthy();
        expect(
          resolveAccountName(option.template.creditAccountName),
        ).toBeTruthy();
      }
    }
  });

  it("resolves duplicated expense names to the 販管費 account, not 製造原価", () => {
    const expenseNames = [
      "消耗品費",
      "通信費",
      "水道光熱費",
      "旅費交通費",
      "租税公課",
      "福利厚生費",
      "雑費",
    ];
    for (const name of expenseNames) {
      const resolved = resolveBookAccountByName(name, DEFAULT_BOOK_ACCOUNTS);
      expect(resolved?.name).toBe(name);
      expect(resolved?.accountType).toBe("expense");
    }
  });
});

function collectReachablePages(): QuickGuidePage[] {
  const seen = new Set<QuickGuidePage>();
  const queue: QuickGuidePage[] = ["top"];
  while (queue.length > 0) {
    const page = queue.shift()!;
    if (seen.has(page)) continue;
    seen.add(page);
    for (const option of guideOptions(page)) {
      if (option.nextPage != null) queue.push(option.nextPage);
    }
  }
  return [...seen];
}

function resolveAccountName(name: string) {
  return resolveBookAccountByName(name, DEFAULT_BOOK_ACCOUNTS);
}
