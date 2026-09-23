import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { describe, expect, it } from "vitest";
import {
  computeFsAggregate,
  isOpeningCarryoverCandidate,
  type EntryRecord as ClientEntryRecord,
  type FsBsRow,
} from "../packages/client-domain/src/index.js";
import { createOpenkkEmbeddedBackendAdapter } from "../packages/embedded-backend-adapter/src/index.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import {
  buildCarryoverOpeningBalances,
  buildCarryoverOpeningJournals,
  buildExpectedClosingEntries,
  DEFAULT_BOOK_ACCOUNTS,
  getDefaultBookAccount,
  type EntryLine,
  type EntryRecord,
  type OpeningBalanceLine,
} from "../packages/server-domain/src/index.js";
import type {
  OpenkkDbPort,
  FiscalPeriodNextCreateInput,
} from "../packages/server-ports/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";
import {
  createSqliteDbAdapter,
  runMigrations,
  type SqlDb,
} from "../packages/sqlite-adapter/src/index.js";

const longText = "保存済み😀".repeat(100);

function line(
  side: "debit" | "credit",
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

function entry(lines: EntryLine[]): EntryRecord {
  return {
    id: "entry-1",
    date: "2026-12-31",
    description: "期末費用",
    localId: null,
    businessRate: 0.3333333333333333,
    lines: lines.map((item, index) => ({ ...item, id: String(index) })),
  };
}

function clientEntry(record: EntryRecord): ClientEntryRecord {
  return {
    ...record,
    fiscalPeriodId: "source",
    weekday: "",
    lines: record.lines.map((item) => {
      const account = getDefaultBookAccount(item.bookAccountId)!;
      return {
        ...item,
        accountName: account.name,
        accountType: account.accountType,
        amount: String(item.amount),
        taxCategoryName: null,
        businessCategoryName: null,
      };
    }),
  };
}

function balance(accountId: string, amount: number): OpeningBalanceLine {
  return { id: accountId, accountId, amount };
}

const CAPITAL_ROW_LABELS = new Set([
  "事業主貸",
  "事業主借",
  "元入金",
  "青色申告特別控除前の所得金額",
  "合計",
]);

function balanceSheetAmounts(
  rows: FsBsRow[],
  column: "opening" | "closing",
): Record<string, number> {
  const amounts: Record<string, number> = {};
  const add = (side: "a" | "l", label: string, amount: number | null) => {
    if (CAPITAL_ROW_LABELS.has(label) || amount == null || amount === 0) return;
    const carriedSide = amount > 0 ? side : side === "a" ? "l" : "a";
    amounts[`${carriedSide}:${label}`] = Math.abs(amount);
  };
  for (const row of rows) {
    add(
      "a",
      row.assetLabel,
      column === "opening" ? row.assetOpening : row.assetClosing,
    );
    add(
      "l",
      row.liabilityLabel,
      column === "opening" ? row.liabilityOpening : row.liabilityClosing,
    );
  }
  return amounts;
}

function assertCarriesClosingBalanceSheet(
  entries: EntryRecord[],
  openingBalanceLines: OpeningBalanceLine[],
  label: string,
): void {
  const closing = computeFsAggregate({
    entries: entries.map(clientEntry),
    openingBalanceLines,
  });
  const carried = buildCarryoverOpeningBalances({
    entries,
    openingBalanceLines,
  });
  const next = computeFsAggregate({ entries: [], openingBalanceLines: carried });
  expect(balanceSheetAmounts(next.bsRows, "opening"), label).toEqual(
    balanceSheetAmounts(closing.bsRows, "closing"),
  );
  expect(
    carried.reduce(
      (total, item) =>
        total + (item.accountId.startsWith("a:") ? item.amount : -item.amount),
      0,
    ),
    label,
  ).toBe(0);
}

describe("carryover calculations", () => {
  it("opens the next period with the closing balance sheet for both sides of every master account", () => {
    for (const account of DEFAULT_BOOK_ACCOUNTS) {
      for (const side of ["debit", "credit"] as const) {
        const entries = [
          entry([
            line(side, account.id, 200),
            line(side === "debit" ? "credit" : "debit", "acct_cash", 200),
          ]),
        ];
        assertCarriesClosingBalanceSheet(
          entries,
          [balance("a:現金", 100), balance("l:元入金", 100)],
          `${account.id}: ${side}`,
        );
      }
    }
  });

  it("agrees on every master account about which entries can be reversed", () => {
    for (const account of DEFAULT_BOOK_ACCOUNTS) {
      for (const side of ["debit", "credit"] as const) {
        const record = entry([
          line(side, account.id, 100),
          line(side === "debit" ? "credit" : "debit", "acct_purchases", 100),
        ]);
        let reversible = false;
        try {
          reversible =
            buildCarryoverOpeningJournals({
              entries: [record],
              startDate: "2027-01-01",
            }).length > 0;
        } catch {
          reversible = false;
        }
        expect(
          isOpeningCarryoverCandidate(clientEntry(record)),
          `${account.id}: ${side}`,
        ).toBe(reversible);
      }
    }
  });

  it.each([
    ["sale", "acct_cash", "acct_sales"],
    ["expense", "acct_supplies", "acct_bank"],
    ["owner withdrawal", "acct_proprietor_withdrawal", "acct_cash"],
    ["owner loan", "acct_cash", "acct_proprietor_loan"],
    ["loan repayment", "acct_proprietor_loan", "acct_cash"],
    ["withdrawal repayment", "acct_cash", "acct_proprietor_withdrawal"],
    ["contrary asset", "acct_supplies", "acct_receivable"],
    ["contrary liability", "acct_accrued_expense", "acct_cash"],
    ["negative capital", "acct_supplies", "acct_accrued_expense"],
  ])(
    "opens the next period with the closing balance sheet for %s",
    (_name, debit, credit) => {
      assertCarriesClosingBalanceSheet(
        [entry([line("debit", debit!, 200), line("credit", credit!, 200)])],
        [balance("a:現金", 100), balance("l:元入金", 100)],
        _name,
      );
    },
  );

  it.each([
    [
      "profit into 元入金",
      [balance("a:普通預金", 50_000)],
      [[line("debit", "acct_bank", 100_000), line("credit", "acct_sales", 100_000)]],
      [balance("a:普通預金", 150_000), balance("l:元入金", 100_000)],
    ],
    [
      "a loss into 元入金",
      [balance("a:現金", 500_000), balance("l:元入金", 500_000)],
      [[line("debit", "acct_communication", 100_000), line("credit", "acct_cash", 100_000)]],
      [balance("a:現金", 400_000), balance("l:元入金", 400_000)],
    ],
    [
      "negative capital as 事業主貸",
      [balance("a:現金", 100_000), balance("l:長期借入金", 100_000)],
      [
        [line("debit", "acct_communication", 150_000), line("credit", "acct_cash", 150_000)],
        [line("debit", "acct_cash", 100_000), line("credit", "acct_capital", 100_000)],
      ],
      [
        balance("a:現金", 50_000),
        balance("l:長期借入金", 100_000),
        balance("a:事業主貸", 50_000),
      ],
    ],
    [
      "owner draws, deposits and profit into 元入金",
      [balance("a:現金", 1_000_000), balance("l:元入金", 1_000_000)],
      [
        [line("debit", "acct_proprietor_withdrawal", 50_000), line("credit", "acct_cash", 50_000)],
        [line("debit", "acct_cash", 30_000), line("credit", "acct_proprietor_loan", 30_000)],
        [line("debit", "acct_cash", 200_000), line("credit", "acct_sales", 200_000)],
      ],
      [balance("a:現金", 1_180_000), balance("l:元入金", 1_180_000)],
    ],
    [
      "a contrary asset balance on the liability side",
      [balance("a:現金", 100_000), balance("l:長期借入金", 100_000)],
      [[line("debit", "acct_communication", 150_000), line("credit", "acct_cash", 150_000)]],
      [
        balance("l:現金", 50_000),
        balance("l:長期借入金", 100_000),
        balance("a:事業主貸", 150_000),
      ],
    ],
  ] as const)(
    "carries %s",
    (_name, openingBalanceLines, lines, expected) => {
      const actual = buildCarryoverOpeningBalances({
        openingBalanceLines,
        entries: lines.map((entryLines, index) => ({
          ...entry([...entryLines]),
          id: `entry-${index + 1}`,
        })),
      });
      expect(actual).toEqual(expect.arrayContaining([...expected]));
      expect(actual).toHaveLength(expected.length);
    },
  );

  it("preserves named balances beyond printed statement slots", () => {
    const openingBalanceLines = [
      ...Array.from({ length: 20 }, (_, index) => balance(`a:科目${index}`, 100)),
      balance("l:元入金", 2000),
    ];
    expect(
      buildCarryoverOpeningBalances({ openingBalanceLines, entries: [] }),
    ).toEqual(openingBalanceLines);
  });

  it("rejects balances outside the safe integer range", () => {
    expect(() =>
      buildCarryoverOpeningBalances({
        openingBalanceLines: [balance("a:現金", Number.MAX_SAFE_INTEGER)],
        entries: [
          entry([
            line("debit", "acct_cash", 1),
            line("credit", "acct_sales", 1),
          ]),
        ],
      }),
    ).toThrow(/safe integer/);
  });

  it("splits compound accruals without duplicating amounts or metadata", () => {
    const record = entry([
      {
        ...line("debit", "acct_purchases", 168_000),
        partnerName: "商品",
        taxCategoryId: "",
      },
      {
        ...line("debit", "acct_supplies", 42_000),
        partnerName: "費用",
        businessCategoryId: "独自",
      },
      {
        ...line("credit", "acct_accrued_expense", 180_000),
        partnerName: "未払先",
      },
      line("credit", "acct_cash", 30_000),
    ]);
    const journals = buildCarryoverOpeningJournals({
      entries: [record],
      startDate: "2027-01-01",
    });
    expect(isOpeningCarryoverCandidate(clientEntry(record))).toBe(true);
    expect(journals).toHaveLength(2);
    expect(journals.map((journal) => journal.lines[0]!.amount)).toEqual([
      168_000, 12_000,
    ]);
    expect(journals[0]).toMatchObject({
      businessRate: record.businessRate,
      lines: [
        {
          side: "debit",
          bookAccountId: "acct_accrued_expense",
          partnerName: "未払先",
        },
        {
          side: "credit",
          bookAccountId: "acct_purchases",
          partnerName: "商品",
          taxCategoryId: "",
        },
      ],
    });
    expect(journals[1]!.lines[1]).toMatchObject({
      partnerName: "費用",
      businessCategoryId: "独自",
    });
  });

  it("matches multiple balance lines only up to each remaining amount", () => {
    const record = entry([
      line("debit", "acct_supplies", 100),
      line("debit", "acct_purchases", 100),
      line("credit", "acct_accrued_expense", 150),
      line("credit", "acct_liability_未払費用", 50),
    ]);
    const journals = buildCarryoverOpeningJournals({
      entries: [record],
      startDate: "2027-01-01",
    });
    expect(journals.map((journal) => journal.lines[0]!.amount)).toEqual([
      100, 50, 50,
    ]);
  });

  it.each([
    ["acct_cash", "acct_sales"],
    ["acct_receivable", "acct_sales"],
    ["acct_purchases", "acct_payable"],
    ["acct_equipment", "acct_cash"],
  ])("rejects non-reversible entry %s / %s", (debit, credit) => {
    const record = entry([
      line("debit", debit, 100),
      line("credit", credit, 100),
    ]);
    expect(isOpeningCarryoverCandidate(clientEntry(record))).toBe(false);
    expect(() =>
      buildCarryoverOpeningJournals({
        entries: [record],
        startDate: "2027-01-01",
      }),
    ).toThrow(/no reversible balance/);
  });

  it("rejects unbalanced entries", () => {
    const record = entry([
      line("debit", "acct_supplies", 100),
      line("credit", "acct_accrued_expense", 99),
    ]);
    expect(() =>
      buildCarryoverOpeningJournals({
        entries: [record],
        startDate: "2027-01-01",
      }),
    ).toThrow(/must equal/);
  });

  it("offers valid accruals with zero-amount lines and ignores empty pairs", () => {
    const record = entry([
      line("debit", "acct_supplies", 100),
      line("credit", "acct_accrued_expense", 100),
      line("debit", "acct_cash", 0),
    ]);
    expect(isOpeningCarryoverCandidate(clientEntry(record))).toBe(true);
    expect(
      buildCarryoverOpeningJournals({
        entries: [record],
        startDate: "2027-01-01",
      }),
    ).toHaveLength(1);
    const zeroLineRecord = entry([
      line("debit", "acct_supplies", 100),
      line("credit", "acct_cash", 100),
      line("credit", "acct_accrued_expense", 0),
    ]);
    expect(isOpeningCarryoverCandidate(clientEntry(zeroLineRecord))).toBe(false);
  });
});

async function closedSource(db: OpenkkDbPort) {
  const server = createOpenkkServer(db, { userId: "user-1" });
  const period = await server.fiscalPeriods.create({
    name: "2026年",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  await server.fiscalPeriods.start(period.id);
  await server.fiscalPeriods.patch(period.id, {
    openingBalancesCompleted: true,
  });
  const accrued = await db.entries.create("user-1", period.id, {
    ...entry([
      {
        ...line("debit", "acct_supplies", 1000),
        partnerName: longText,
        taxCategoryId: longText,
        businessCategoryId: longText,
      },
      line("credit", "acct_accrued_expense", 1000),
    ]),
    date: "2026-12-31",
    description: longText,
    localId: null,
  });
  await db.fixedAssets.create("user-1", period.id, {
    name: longText,
    acquisitionDate: period.startDate,
    acquisitionCost: 120000,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    bookAccountId: "acct_equipment",
  });
  const retired = await server.fixedAssets.create(period.id, {
    name: "償却済み資産",
    acquisitionDate: "2020-01-01",
    acquisitionCost: 1200,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    bookAccountId: "acct_equipment",
  });
  await server.fixedAssets.patch(period.id, retired.id, { status: "retired" });
  await server.preClosings.run(period.id, 2026);
  await server.closings.run(
    period.id,
    2026,
    buildExpectedClosingEntries({
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: await server.entries.getAll(period.id),
      fixedAssets: await server.fixedAssets.getAll(period.id),
      openingJournals: [],
      bookAccounts: await server.masterData.getBookAccounts(),
    }),
  );
  await server.fiscalPeriods.patch(period.id, {
    documentsReceivedCompleted: true,
  });
  const input: FiscalPeriodNextCreateInput = {
    sourceFiscalPeriodId: period.id,
    name: "2027年",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    carryBalances: true,
    reversalEntryIds: [accrued.id],
    carryFixedAssets: true,
  };
  return { server, period, accrued, input };
}

describe("atomic fiscal period carryover", () => {
  it("preserves saved text through the backend boundary and source purge", async () => {
    const { server, period, input } = await closedSource(
      await createMemoryDbAdapter(null),
    );
    await server.fiscalPeriods.archive(period.id);
    const backend = createOpenkkEmbeddedBackendAdapter(server);
    const next = await backend.fiscalPeriods.createNext(input);
    expect(next).toMatchObject({
      phase: "pre_opening",
      openingBalancesCompleted: true,
    });
    expect(next.opening.openingJournals[0]).toMatchObject({
      description: `再振替: ${longText}`,
      businessRate: 0.3333333333333333,
      lines: [
        { side: "debit", bookAccountId: "acct_accrued_expense" },
        {
          side: "credit",
          partnerName: longText,
          taxCategoryId: longText,
          businessCategoryId: longText,
        },
      ],
    });
    expect(await backend.fixedAssets.getAll(next.id)).toMatchObject([
      { name: longText, status: "active" },
    ]);
    await backend.fiscalPeriods.purgeArchivedData(period.id);
    expect(
      (await backend.fiscalPeriods.getAll()).find((item) => item.id === next.id),
    ).toEqual(next);
    await backend.fiscalPeriods.start(next.id);
    await backend.preClosings.run(next.id, 2027);
    const closed = await backend.closings.run(
      next.id,
      2027,
      buildExpectedClosingEntries({
        periodStartDate: next.startDate,
        periodEndDate: next.endDate,
        entries: [],
        fixedAssets: await backend.fixedAssets.getAll(next.id),
        openingJournals: next.opening.openingJournals,
        bookAccounts: await backend.masterData.getBookAccounts(),
      }),
    );
    expect(closed.phase).toBe("post_closing");
    expect(await backend.entries.getAll(next.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: `再振替: ${longText}` }),
      ]),
    );
  });

  it.each([false, true])(
    "honors independent carryover selections (balances: %s)",
    async (carryBalances) => {
      const { server, input } = await closedSource(
        await createMemoryDbAdapter(null),
      );
      const next = await server.fiscalPeriods.createNext({
        ...input,
        carryBalances,
        reversalEntryIds: [],
        carryFixedAssets: false,
      });
      expect(next.openingBalancesCompleted).toBe(carryBalances);
      expect(next.opening.openingBalanceLines.length > 0).toBe(carryBalances);
      expect(next.opening.openingJournals).toEqual([]);
      expect(await server.fixedAssets.getAll(next.id)).toEqual([]);
    },
  );

  it("rejects missing and duplicate source entries", async () => {
    const { server, input } = await closedSource(
      await createMemoryDbAdapter(null),
    );
    for (const [reversalEntryIds, message] of [
      [["foreign-entry"], /Reversal entry foreign-entry not found/],
      [
        [input.reversalEntryIds[0]!, input.reversalEntryIds[0]!],
        /Reversal entry id has a duplicate value/,
      ],
      [[""], /Reversal entry id is required/],
    ] as const) {
      await expect(
        server.fiscalPeriods.createNext({
          ...input,
          reversalEntryIds: [...reversalEntryIds],
        }),
      ).rejects.toThrow(message);
    }
    expect(await server.fiscalPeriods.getAll()).toHaveLength(1);
  });

  it("allows other fields to change while keeping stored long text", async () => {
    const { server, input } = await closedSource(
      await createMemoryDbAdapter(null),
    );
    const next = await server.fiscalPeriods.createNext(input);
    const opening = next.opening;
    const journals = opening.openingJournals.map((journal) => ({
      ...journal,
      businessRate: 0.5,
    }));
    await expect(
      server.fiscalPeriods.patch(next.id, {
        opening: { ...opening, openingJournals: journals },
      }),
    ).resolves.toMatchObject({
      opening: {
        openingJournals: [
          { description: `再振替: ${longText}`, businessRate: 0.5 },
        ],
      },
    });
    await expect(
      server.fiscalPeriods.patch(next.id, {
        opening: {
          ...opening,
          openingJournals: journals.map((journal) => ({
            ...journal,
            description: longText + "変更",
          })),
        },
      }),
    ).rejects.toThrow(/400 character limit/);
    await server.fiscalPeriods.start(next.id);
    const [asset] = await server.fixedAssets.getAll(next.id);
    await expect(
      server.fixedAssets.patch(next.id, asset!.id, {
        name: longText,
        businessRate: 0.5,
      }),
    ).resolves.toMatchObject({ name: longText, businessRate: 0.5 });
    await expect(
      server.fixedAssets.patch(next.id, asset!.id, { name: longText + "変更" }),
    ).rejects.toThrow(/400 character limit/);
  });

  it("updates an imported entry without rejecting its unchanged long text", async () => {
    const db = await createMemoryDbAdapter(null);
    const server = createOpenkkServer(db, { userId: "user-1" });
    const period = await db.fiscalPeriods.create("user-1", {
      name: longText,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await server.fiscalPeriods.patch(period.id, {
      name: longText,
      openingBalancesCompleted: true,
    });
    await server.fiscalPeriods.start(period.id);
    const stored = await db.entries.create("user-1", period.id, {
      date: period.startDate,
      description: longText,
      businessRate: 1,
      localId: null,
      lines: [
        line("debit", "acct_cash", 100),
        line("credit", "acct_sales", 100),
      ].map((item) => ({
        ...item,
        partnerName: longText,
        taxCategoryId: longText,
        businessCategoryId: longText,
      })),
    });
    await expect(
      server.entries.update(period.id, stored.id, {
        ...stored,
        businessRate: 0.5,
      }),
    ).resolves.toMatchObject({ description: longText, businessRate: 0.5 });
    await expect(
      server.entries.update(period.id, stored.id, {
        ...stored,
        description: longText + "変更",
      }),
    ).rejects.toThrow(/400 character limit/);
    await expect(server.entries.create(period.id, stored)).rejects.toThrow(
      /400 character limit/,
    );
  });

  it("checks ownership, source state, dates, overlap and required options", async () => {
    const db = await createMemoryDbAdapter(null);
    const { server, input } = await closedSource(db);
    await expect(
      createOpenkkServer(db, { userId: "other" }).fiscalPeriods.createNext(
        input,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      server.fiscalPeriods.createNext({ ...input, startDate: "2026-01-01" }),
    ).rejects.toThrow();
    await expect(
      server.fiscalPeriods.createNext({
        ...input,
        carryBalances: null,
      } as never),
    ).rejects.toThrow();
    await expect(
      server.fiscalPeriods.createNext({
        ...input,
        reversalEntryIds: null,
      } as never),
    ).rejects.toThrow();
    const next = await server.fiscalPeriods.createNext(input);
    await expect(server.fiscalPeriods.createNext(input)).rejects.toThrow(
      /overlaps/,
    );
    await expect(
      server.fiscalPeriods.createNext({
        ...input,
        sourceFiscalPeriodId: next.id,
        startDate: "2028-01-01",
        endDate: "2028-12-31",
      }),
    ).rejects.toThrow(/closing/);
    expect(await server.fiscalPeriods.getAll()).toHaveLength(2);
    await server.fiscalPeriods.archive(input.sourceFiscalPeriodId);
    await server.fiscalPeriods.purgeArchivedData(input.sourceFiscalPeriodId);
    await expect(
      server.fiscalPeriods.createNext({
        ...input,
        startDate: "2028-01-01",
        endDate: "2028-12-31",
      }),
    ).rejects.toThrow(/purged/);
  });

  it("serializes concurrent requests so the next period is created once", async () => {
    const { server, input } = await closedSource(
      await createMemoryDbAdapter(null),
    );
    const results = await Promise.allSettled([
      server.fiscalPeriods.createNext(input),
      server.fiscalPeriods.createNext(input),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await server.fiscalPeriods.getAll()).toHaveLength(2);
  });

  it.each(["opening_journal_lines", "fixed_assets"])(
    "rolls back every next-period write when %s fails",
    async (table) => {
      const sqlite = await sqlite3InitModule({
        print: () => {},
        printErr: () => {},
      });
      const raw = new sqlite.oo1.DB(":memory:");
      runMigrations(raw);
      let failWrites = false;
      const sql: SqlDb = {
        async exec(input) {
          await Promise.resolve();
          const statement = typeof input === "string" ? input : input.sql;
          if (failWrites && statement.includes(`INSERT INTO ${table}`))
            throw new Error("injected write failure");
          return (raw as unknown as { exec(input: unknown): unknown }).exec(
            input,
          );
        },
      };
      try {
        const db = await createSqliteDbAdapter(sql, null);
        const { server, input } = await closedSource(db);
        const before = await server.fiscalPeriods.getAll();
        const sourceEntries = await server.entries.getAll(
          input.sourceFiscalPeriodId,
        );
        failWrites = true;
        await expect(server.fiscalPeriods.createNext(input)).rejects.toThrow(
          "injected write failure",
        );
        expect(await server.fiscalPeriods.getAll()).toEqual(before);
        expect(await server.entries.getAll(input.sourceFiscalPeriodId)).toEqual(
          sourceEntries,
        );
        failWrites = false;
        await expect(
          server.fiscalPeriods.createNext(input),
        ).resolves.toMatchObject({ name: "2027年" });
        expect(await server.fiscalPeriods.getAll()).toHaveLength(2);
      } finally {
        raw.close();
      }
    },
  );
});
