import { describe, expect, it } from "vitest";
import {
  buildClosingVirtualEntries,
  buildGeneralLedgerBody,
  computeFsAggregate,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  importEntriesFromCsv,
  importEntriesFromJson,
  type EntryRecord as ClientEntryRecord,
} from "../packages/client-domain/src/index.js";
import { entryRecordToImportPayload } from "../packages/client-usecases/src/entries/import-mapping.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import {
  buildCarryoverOpeningBalances,
  type Entry,
  type EntryLine,
} from "../packages/server-domain/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";

const OWNER_LOAN = "acct_proprietor_loan";
const master = {
  accounts: DEFAULT_BOOK_ACCOUNTS,
  taxes: DEFAULT_TAX_CATEGORIES,
  businesses: DEFAULT_BUSINESS_CATEGORIES,
};

function line(
  side: EntryLine["side"],
  bookAccountId: string,
  amount: number,
): EntryLine {
  return {
    side,
    bookAccountId,
    amount,
    partnerName: "",
    taxCategoryId: "tax_out_of_scope",
    businessCategoryId: "biz_none",
  };
}

function entry(lines: EntryLine[], businessRate = 1): Entry {
  return {
    date: "2026-06-01",
    description: "事業主借の検証",
    localId: null,
    businessRate,
    lines,
  };
}

function clientEntry(record: Entry, index = 0): ClientEntryRecord {
  return {
    ...record,
    id: `entry-${index}`,
    fiscalPeriodId: "fp-2026",
    weekday: "",
    lines: record.lines.map((item) => {
      const account = DEFAULT_BOOK_ACCOUNTS.find(
        (account) => account.id === item.bookAccountId,
      )!;
      return {
        ...item,
        id: null,
        accountName: account.name,
        accountType: account.accountType,
        amount: String(item.amount),
        taxCategoryName: null,
        businessCategoryName: null,
      };
    }),
  };
}

function balance(accountId: string, amount: number) {
  return { id: accountId, accountId, amount };
}

describe("事業主借 equity contract", () => {
  it.each([
    ["contribution", "credit", 30_000, 130_000],
    ["repayment", "debit", 30_000, 70_000],
    ["full repayment", "debit", 100_000, 0],
    ["excess repayment", "debit", 120_000, -20_000],
  ] as const)(
    "keeps %s in equity across the BS, ledger and carryover",
    (_name, side, amount, remaining) => {
      const openingBalanceLines = [
        balance("a:現金", 200_000),
        balance("l:事業主借", 100_000),
        balance("l:元入金", 100_000),
      ];
      const saved = entry([
        line(side, OWNER_LOAN, amount),
        line(side === "debit" ? "credit" : "debit", "acct_cash", amount),
      ]);
      const record = clientEntry(saved);
      const aggregate = computeFsAggregate({
        entries: [record],
        openingBalanceLines,
      });
      expect(aggregate.summary).toEqual({
        revenue: 0,
        expenses: 0,
        profit: 0,
        assets: 100_000 + remaining,
        liabilities: 0,
        equity: 100_000 + remaining,
      });
      expect(
        aggregate.bsRows.find((row) => row.liabilityLabel === "事業主借"),
      ).toMatchObject({
        liabilityOpening: 100_000,
        liabilityClosing: remaining === 0 ? null : remaining,
      });
      expect(
        aggregate.bsRows.some((row) => row.assetLabel === "事業主借"),
      ).toBe(false);
      expect(aggregate.bsRows.at(-1)).toMatchObject({
        assetClosing: 100_000 + remaining,
        liabilityClosing: 100_000 + remaining,
      });

      // Liability and equity both have credit-normal balances: ledger amounts must not change.
      const oldRecord: ClientEntryRecord = {
        ...record,
        lines: record.lines.map((item) =>
          item.bookAccountId === OWNER_LOAN
            ? { ...item, accountType: "liability" }
            : item,
        ),
      };
      expect(
        buildGeneralLedgerBody("2026年分", [record], openingBalanceLines),
      ).toBe(
        buildGeneralLedgerBody("2026年分", [oldRecord], openingBalanceLines),
      );
      expect(
        buildCarryoverOpeningBalances({
          entries: [saved],
          openingBalanceLines,
        }),
      ).toEqual([
        balance("a:現金", 100_000 + remaining),
        balance("l:元入金", 100_000 + remaining),
      ]);
    },
  );

  it.each(["csv", "json"] as const)(
    "imports legacy name-only %s with the liability classification",
    (format) => {
      const legacy = {
        localId: "legacy-owner-loan",
        date: "2026-06-01",
        debit: "現金",
        debitType: "asset",
        debitAmount: "30000",
        credit: "事業主借",
        creditType: "liability",
        creditAmount: "30000",
        description: "旧形式の事業主借",
        businessRate: "100%",
      };
      const text =
        format === "json"
          ? JSON.stringify({ entries: [legacy] })
          : [
              Object.keys(legacy).join(","),
              Object.values(legacy).join(","),
            ].join("\n");
      const [record] = (
        format === "json" ? importEntriesFromJson : importEntriesFromCsv
      )({
        text,
        fiscalPeriodId: "fp-2026",
      });
      expect(record!.lines[1]).toMatchObject({
        bookAccountId: null,
        accountType: "liability",
      });
      const payload = entryRecordToImportPayload(record!, master);
      expect(payload.lines).toEqual([
        line("debit", "acct_cash", 30_000),
        line("credit", OWNER_LOAN, 30_000),
      ]);
      expect(clientEntry(payload).lines[1]?.accountType).toBe("equity");
    },
  );

  it.each([null, OWNER_LOAN] as const)(
    "accepts the old classification with account ID %j",
    (id) => {
      const record = clientEntry(
        entry([
          line("debit", "acct_cash", 100),
          line("credit", OWNER_LOAN, 100),
        ]),
      );
      record.lines[1] = {
        ...record.lines[1]!,
        bookAccountId: id,
        accountType: "liability",
      };
      expect(
        entryRecordToImportPayload(record, master).lines[1]?.bookAccountId,
      ).toBe(OWNER_LOAN);
    },
  );

  it("keeps identity errors and unrelated type mismatches invalid", () => {
    const record = clientEntry(
      entry([line("debit", "acct_cash", 100), line("credit", OWNER_LOAN, 100)]),
    );
    for (const override of [
      {
        bookAccountId: "unknown",
        accountName: "事業主借",
        accountType: "liability",
      },
      { bookAccountId: null, accountName: "事業主借", accountType: "asset" },
      { bookAccountId: null, accountName: "元入金", accountType: "liability" },
      { bookAccountId: null, accountName: "事業主貸", accountType: "equity" },
    ] as const) {
      const invalid = {
        ...record,
        lines: [record.lines[0]!, { ...record.lines[1]!, ...override }],
      };
      expect(() => entryRecordToImportPayload(invalid, master)).toThrow(
        "entries.import: unresolved bookAccountId",
      );
    }
  });

  it("keeps equity and revenue consistent through automatic allocation, closing, reload and next period", async () => {
    const db = await createMemoryDbAdapter(null);
    const server = createOpenkkServer(db, { userId: "user-1" });
    const accounts = await server.masterData.getBookAccounts();
    for (const catalog of [DEFAULT_BOOK_ACCOUNTS, accounts]) {
      expect(
        catalog.find((account) => account.id === OWNER_LOAN),
      ).toMatchObject({
        name: "事業主借",
        accountType: "equity",
        balanceSheetSection: "equity",
        normalBalanceSide: "credit",
      });
      expect(
        catalog.find((account) => account.id === "acct_proprietor_withdrawal"),
      ).toMatchObject({
        name: "事業主貸",
        accountType: "asset",
        normalBalanceSide: "debit",
      });
    }
    const period = await server.fiscalPeriods.create({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await server.fiscalPeriods.start(period.id);
    const openingBalanceLines = [
      balance("a:現金", 100_000),
      balance("l:事業主借", 100_000),
    ];
    await server.fiscalPeriods.patch(period.id, {
      openingBalancesCompleted: true,
      opening: { balanceLines: openingBalanceLines, journals: [] },
    });
    await server.entries.create(
      period.id,
      entry([
        line("debit", OWNER_LOAN, 30_000),
        line("credit", "acct_cash", 30_000),
      ]),
    );
    await server.entries.create(
      period.id,
      entry(
        [
          line("debit", "acct_cash", 100_000),
          line("credit", "acct_sales", 100_000),
        ],
        0.5,
      ),
    );
    const records = (await server.entries.getAll(period.id)).map(clientEntry);
    const virtual = buildClosingVirtualEntries({
      fiscalPeriodId: period.id,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: records,
      assets: [],
      carryovers: [],
    });
    expect(virtual).toHaveLength(1);
    expect(
      virtual[0]!.lines.find((item) => item.bookAccountId === OWNER_LOAN),
    ).toMatchObject({
      side: "credit",
      amount: "50,000",
      accountType: "equity",
    });
    const preview = computeFsAggregate({
      entries: [...records, ...virtual],
      openingBalanceLines,
    });
    expect(preview.summary).toEqual({
      assets: 170_000,
      liabilities: 0,
      equity: 170_000,
      revenue: 50_000,
      expenses: 0,
      profit: 50_000,
    });
    expect(
      preview.bsRows.find((row) => row.liabilityLabel === "事業主借")
        ?.liabilityClosing,
    ).toBe(120_000);

    await server.preClosings.run(period.id, 2026);
    await server.closings.run(
      period.id,
      2026,
      virtual.map((record) => entryRecordToImportPayload(record, master)),
    );
    const reloaded = createOpenkkServer(db, { userId: "user-1" });
    const closedEntries = (await reloaded.entries.getAll(period.id)).map(
      clientEntry,
    );
    expect(
      computeFsAggregate({ entries: closedEntries, openingBalanceLines }),
    ).toEqual(preview);
    await reloaded.fiscalPeriods.patch(period.id, {
      documentsReceivedCompleted: true,
    });
    const next = await reloaded.fiscalPeriods.createNext({
      sourceFiscalPeriodId: period.id,
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      carryBalances: true,
      reversalEntryIds: [],
      carryFixedAssets: false,
    });
    expect(next.opening.balanceLines).toEqual([
      balance("a:現金", 170_000),
      balance("l:元入金", 170_000),
    ]);
  });
});
