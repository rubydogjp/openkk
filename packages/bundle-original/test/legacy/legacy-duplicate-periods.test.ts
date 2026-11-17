import { describe, expect, it } from "vitest";

import {
  isSameLegacyPeriodContent,
  mergeLegacyDuplicatePeriods,
} from "../../app/legacy/legacy-duplicate-periods";

type Period = ReturnType<typeof period>;

function line(side: "debit" | "credit", bookAccountId: string, id: string) {
  return {
    id,
    side,
    bookAccountId,
    amount: 1000,
    partnerName: "取引先",
    taxCategoryId: "tax_out_of_scope",
    businessCategoryId: "biz_none",
  };
}

function entry(prefix: string, date: string, description: string) {
  return {
    id: `${prefix}-entry-${description}`,
    userId: "user-1",
    fiscalPeriodId: `${prefix}-period`,
    date,
    description,
    localId: null as string | null,
    businessRate: 0.8,
    createdAt: `${prefix}-created`,
    updatedAt: `${prefix}-updated`,
    lines: [
      line("debit", "acct_cash", `${prefix}-${description}-1`),
      line("credit", "acct_sales", `${prefix}-${description}-2`),
    ],
  };
}

function period(prefix: string, archiveStatus: string, createdAt: string) {
  return {
    fiscalPeriod: {
      id: `${prefix}-period`,
      name: "2023年分",
      userId: "user-1",
      startDate: "2023-01-01",
      endDate: "2023-12-31",
      phase: "post_closing",
      archiveStatus,
      archivedAt: archiveStatus === "archived" ? "2024-01-15" : null,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
      createdAt,
      updatedAt: createdAt,
      opening: {
        balanceLines: [
          { id: `${prefix}-cash`, accountId: "acct_cash", amount: 5000 },
        ],
        journals: [
          {
            id: `${prefix}-journal`,
            date: "2023-01-01",
            description: "再振替",
            businessRate: 1,
            lines: [line("debit", "acct_cash", `${prefix}-journal-1`)],
          },
        ],
      },
    },
    entries: [
      entry(prefix, "2023-03-01", "売上"),
      entry(prefix, "2023-12-31", "減価償却"),
      entry(prefix, "2023-12-31", "除却"),
    ],
    fixedAssets: [
      {
        id: `${prefix}-asset`,
        userId: "user-1",
        fiscalPeriodId: `${prefix}-period`,
        name: "カメラ",
        acquisitionDate: "2023-01-05",
        acquisitionCost: 300000,
        usefulLife: 5,
        depreciationMethod: "straight_line",
        businessRate: 1,
        status: "sold",
        disposalDate: "2023-11-30",
        disposalPrice: 200000,
        bookAccountId: "acct_equipment",
        createdAt: `${prefix}-created`,
        updatedAt: `${prefix}-updated`,
      },
    ],
  };
}

function original(): Period {
  return period("original", "archived", "2023-01-01T00:00:00.000Z");
}

function importedCopy(): Period {
  return period("copy", "active", "2024-01-20T00:00:00.000Z");
}

describe("isSameLegacyPeriodContent", () => {
  it("does not look at ids, created and updated times, or archived against active", () => {
    expect(isSameLegacyPeriodContent(original(), importedCopy())).toBe(true);
  });

  it("does not look at the order of entries of the same date or of fixed assets", () => {
    const copy = importedCopy();
    copy.entries.reverse();
    copy.fixedAssets.reverse();

    expect(isSameLegacyPeriodContent(original(), copy)).toBe(true);
  });

  it.each<[string, (copy: Period) => void]>([
    ["the name", (copy) => (copy.fiscalPeriod.name = "2023年分 (写し)")],
    ["the phase", (copy) => (copy.fiscalPeriod.phase = "closing")],
    [
      "a step marked done",
      (copy) => (copy.fiscalPeriod.documentsReceivedCompleted = false),
    ],
    ["data deleted", (copy) => (copy.fiscalPeriod.archiveStatus = "purged")],
    [
      "an opening balance",
      (copy) => (copy.fiscalPeriod.opening.balanceLines[0]!.amount = 5001),
    ],
    [
      "an opening journal",
      (copy) =>
        (copy.fiscalPeriod.opening.journals[0]!.description = "再振替 (改)"),
    ],
    ["an entry date", (copy) => (copy.entries[0]!.date = "2023-03-02")],
    ["an entry description", (copy) => (copy.entries[0]!.description = "売")],
    ["a business rate", (copy) => (copy.entries[0]!.businessRate = 1)],
    ["an entry number", (copy) => (copy.entries[0]!.localId = "A-1")],
    [
      "a line account",
      (copy) => (copy.entries[0]!.lines[0]!.bookAccountId = "acct_bank"),
    ],
    ["a line amount", (copy) => (copy.entries[0]!.lines[0]!.amount = 999)],
    [
      "a line partner",
      (copy) => (copy.entries[0]!.lines[0]!.partnerName = "別の取引先"),
    ],
    [
      "a line tax category",
      (copy) => (copy.entries[0]!.lines[0]!.taxCategoryId = "tax_sales_10"),
    ],
    [
      "a line business category",
      (copy) => (copy.entries[0]!.lines[0]!.businessCategoryId = "biz_5"),
    ],
    ["the order of lines", (copy) => copy.entries[0]!.lines.reverse()],
    ["an entry missing", (copy) => copy.entries.pop()],
    ["a fixed asset name", (copy) => (copy.fixedAssets[0]!.name = "レンズ")],
    [
      "a fixed asset cost",
      (copy) => (copy.fixedAssets[0]!.acquisitionCost = 1),
    ],
    ["a fixed asset life", (copy) => (copy.fixedAssets[0]!.usefulLife = 4)],
    [
      "a fixed asset status",
      (copy) => (copy.fixedAssets[0]!.status = "active"),
    ],
    ["a disposal price", (copy) => (copy.fixedAssets[0]!.disposalPrice = 1)],
    ["a fixed asset missing", (copy) => copy.fixedAssets.pop()],
  ])("tells a different %s", (_, change) => {
    const copy = importedCopy();
    change(copy);

    expect(isSameLegacyPeriodContent(original(), copy)).toBe(false);
  });
});

describe("mergeLegacyDuplicatePeriods", () => {
  it("keeps the archived original of two same periods and merges the imported copy", () => {
    const kept = original();
    const copy = importedCopy();

    expect(mergeLegacyDuplicatePeriods([copy, kept])).toEqual({
      kept: [kept],
      merged: [copy],
    });
  });

  it("keeps the older of two same active periods", () => {
    const older = period("older", "active", "2023-01-01T00:00:00.000Z");
    const newer = period("newer", "active", "2024-01-01T00:00:00.000Z");

    expect(mergeLegacyDuplicatePeriods([newer, older])).toEqual({
      kept: [older],
      merged: [newer],
    });
  });

  it("keeps both when their contents differ", () => {
    const copy = importedCopy();
    copy.entries[0]!.lines[0]!.amount = 999;

    expect(mergeLegacyDuplicatePeriods([original(), copy])).toEqual({
      kept: [original(), copy],
      merged: [],
    });
  });

  it("does not merge same contents of other dates or of another user", () => {
    const otherDates = importedCopy();
    otherDates.fiscalPeriod.endDate = "2023-12-30";
    const otherUser = importedCopy();
    otherUser.fiscalPeriod.userId = "user-2";

    expect(
      mergeLegacyDuplicatePeriods([original(), otherDates, otherUser]).merged,
    ).toEqual([]);
  });
});
