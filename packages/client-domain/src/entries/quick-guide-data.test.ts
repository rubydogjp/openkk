import { describe, expect, it } from "vitest";

import { DEFAULT_BOOK_ACCOUNTS } from "./default-master-data";
import {
  ACCOUNT_ALIASES,
  guideOptions,
  guideTitle,
  normalizeAccountName,
  type QuickGuidePage,
} from "./quick-guide-data";

describe("quick guide data", () => {
  it("does not expose unresolved fallback text", () => {
    const pages = collectReachablePages();

    for (const page of pages) {
      expect(guideTitle(page)).not.toContain("未対応");
      expect(guideOptions(page).some((option) => option.title.includes("未対応")))
        .toBe(false);
    }
  });

  it("uses account names that resolve to default master data", () => {
    for (const page of collectReachablePages()) {
      for (const option of guideOptions(page)) {
        if (option.template == null) continue;

        expect(resolveAccountName(option.template.debitAccountName)).toBeTruthy();
        expect(resolveAccountName(option.template.creditAccountName)).toBeTruthy();
      }
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
  const aliases = ACCOUNT_ALIASES[name] ?? [name];
  for (const alias of aliases) {
    const normalized = normalizeAccountName(alias);
    const exact = DEFAULT_BOOK_ACCOUNTS.find(
      (account) => normalizeAccountName(account.name) === normalized,
    );
    if (exact != null) return exact;
  }
  return null;
}
