import type {
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "../ports/index.js";
import { isOpenkkApiErrorDto } from "../ports/index.js";
import { copyFiscalPeriodToBackend } from "../usecases/archive/fiscal-period-transfer.js";
import { buildFinalClosingPayload } from "../usecases/closing/final-closing.js";
import {
  loadFiscalPeriodReportInput,
  loadJournalMaster,
  type LoadedJournalMaster,
} from "../usecases/records/load-records.js";

export type BackendContractSubject = {
  backend: OpenkkBackendPort;
  close(): Promise<void>;
};

export type OpenBackendContractSubject = () => Promise<BackendContractSubject>;

export type BackendContractCase = {
  name: string;
  run(open: OpenBackendContractSubject): Promise<void>;
};

const PERIOD_2026 = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};
const PERIOD_2027 = {
  name: "2027年分",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
};
const CLOSING_DAY = new Date(2026, 11, 31);
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const CASH = "現金";
const SALES = "売上";
const EQUIPMENT = "工具器具備品";
const OWNER_EQUITY = "元入金";

function check(condition: boolean, expectation: string): asserts condition {
  if (!condition) throw new Error(`backend contract: ${expectation}`);
}

async function rejectionOf(
  call: Promise<unknown>,
  expectation: string,
): Promise<unknown> {
  let resolved = false;
  try {
    await call;
    resolved = true;
  } catch (error) {
    return error;
  }
  check(!resolved, expectation);
  return null;
}

async function checkRejectedWith(
  statusCode: number,
  call: Promise<unknown>,
  expectation: string,
): Promise<void> {
  const error = await rejectionOf(call, expectation);
  check(
    isOpenkkApiErrorDto(error),
    `${expectation} (the rejection must be an OpenkkApiErrorDto)`,
  );
  check(
    error.statusCode === statusCode,
    `${expectation} (expected status ${statusCode}, got ${error.statusCode})`,
  );
  check(
    error.messageForUser.trim() !== "",
    `${expectation} (the rejection must carry a message for the user)`,
  );
}

function accountId(master: LoadedJournalMaster, name: string): string {
  const account = master.accounts.find((candidate) => candidate.name === name);
  check(account != null, `master data has the account ${name}`);
  return account.id;
}

function pairEntry(
  master: LoadedJournalMaster,
  input: {
    date: string;
    description: string;
    debit: string;
    credit: string;
    amount: number;
    localId: string | null;
  },
): EntryUpsertInput {
  const [taxCategory] = master.taxCategories;
  const [businessCategory] = master.businessCategories;
  check(
    taxCategory != null && businessCategory != null,
    "master data has tax and business categories",
  );
  const line = (side: "debit" | "credit", name: string) => ({
    side,
    bookAccountId: accountId(master, name),
    amount: input.amount,
    partnerName: "",
    taxCategoryId: taxCategory.id,
    businessCategoryId: businessCategory.id,
  });
  return {
    date: input.date,
    description: input.description,
    localId: input.localId,
    businessRate: 1,
    lines: [line("debit", input.debit), line("credit", input.credit)],
  };
}

async function journalizingPeriod(
  backend: OpenkkBackendPort,
): Promise<FiscalPeriodApiRecord> {
  const created = await backend.fiscalPeriods.create(PERIOD_2026);
  await backend.fiscalPeriods.start(created.id);
  return backend.fiscalPeriods.patch(created.id, {
    openingBalancesCompleted: true,
  });
}

const OPENING_CASH = 100_000;
const SALES_IN_CASH = 50_000;
const CASH_BALANCE_LINE_ID = `a:${CASH}`;

async function closedPeriodWithFixedAsset(
  backend: OpenkkBackendPort,
): Promise<FiscalPeriodApiRecord> {
  const created = await backend.fiscalPeriods.create(PERIOD_2026);
  await backend.fiscalPeriods.start(created.id);
  const period = await backend.fiscalPeriods.patch(created.id, {
    openingBalancesCompleted: true,
    opening: {
      balanceLines: [
        {
          id: CASH_BALANCE_LINE_ID,
          accountId: CASH_BALANCE_LINE_ID,
          amount: OPENING_CASH,
        },
        {
          id: `l:${OWNER_EQUITY}`,
          accountId: `l:${OWNER_EQUITY}`,
          amount: OPENING_CASH,
        },
      ],
      journals: [],
    },
  });
  const master = await loadJournalMaster(backend);
  await backend.entries.create(
    period.id,
    pairEntry(master, {
      date: "2026-03-01",
      description: "売上",
      debit: CASH,
      credit: SALES,
      amount: SALES_IN_CASH,
      localId: null,
    }),
  );
  await backend.fixedAssets.create(period.id, {
    name: "ノートパソコン",
    acquisitionDate: "2026-01-10",
    acquisitionCost: 240_000,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    bookAccountId: accountId(master, EQUIPMENT),
  });
  const preClosed = await backend.preClosings.run(period.id);
  await backend.closings.run(
    period.id,
    buildFinalClosingPayload(
      await loadFiscalPeriodReportInput(backend, preClosed, CLOSING_DAY),
      master,
    ),
  );
  return backend.fiscalPeriods.patch(period.id, {
    documentsReceivedCompleted: true,
  });
}

function openingCashOf(period: FiscalPeriodApiRecord): number | null {
  return (
    period.opening.balanceLines.find(
      (line) => line.accountId === CASH_BALANCE_LINE_ID,
    )?.amount ?? null
  );
}

async function storedPeriod(
  backend: OpenkkBackendPort,
  id: string,
): Promise<FiscalPeriodApiRecord> {
  const period = (await backend.fiscalPeriods.getAll()).find(
    (candidate) => candidate.id === id,
  );
  check(period != null, `the fiscal period ${id} is listed`);
  return period;
}

async function withSubject(
  open: OpenBackendContractSubject,
  run: (backend: OpenkkBackendPort) => Promise<void>,
): Promise<void> {
  const subject = await open();
  try {
    await run(subject.backend);
  } finally {
    await subject.close();
  }
}

function contractCase(
  name: string,
  run: (backend: OpenkkBackendPort) => Promise<void>,
): BackendContractCase {
  return { name, run: (open) => withSubject(open, run) };
}

export const BACKEND_CONTRACT_CASES: BackendContractCase[] = [
  contractCase("serves master data with unique ids", async (backend) => {
    const master = await loadJournalMaster(backend);
    for (const [label, items] of [
      ["book accounts", master.accounts],
      ["tax categories", master.taxCategories],
      ["business categories", master.businessCategories],
    ] as const) {
      check(items.length > 0, `${label} are not empty`);
      check(
        new Set(items.map((item) => item.id)).size === items.length,
        `${label} have unique ids`,
      );
    }
    for (const name of [CASH, SALES, EQUIPMENT, OWNER_EQUITY]) {
      accountId(master, name);
    }
  }),

  contractCase("starts with no fiscal periods", async (backend) => {
    check(
      (await backend.fiscalPeriods.getAll()).length === 0,
      "a new user has no fiscal periods",
    );
  }),

  contractCase("creates a fiscal period before opening", async (backend) => {
    const created = await backend.fiscalPeriods.create(PERIOD_2026);
    check(created.id.trim() !== "", "the created period has an id");
    check(created.phase === "pre_opening", "a new period is pre_opening");
    check(created.archiveStatus === "active", "a new period is active");
    check(
      created.opening.balanceLines.length === 0 &&
        created.opening.journals.length === 0,
      "a new period has an empty opening",
    );
    const listed = await backend.fiscalPeriods.getAll();
    check(
      listed.length === 1 && listed[0]?.id === created.id,
      "the created period is listed",
    );
  }),

  contractCase("refuses an overlapping fiscal period", async (backend) => {
    await backend.fiscalPeriods.create(PERIOD_2026);
    await checkRejectedWith(
      HTTP_CONFLICT,
      backend.fiscalPeriods.create({
        name: "重なる期間",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
      }),
      "a period overlapping an active one is refused",
    );
  }),

  contractCase("answers 404 for a missing fiscal period", async (backend) => {
    await checkRejectedWith(
      HTTP_NOT_FOUND,
      backend.fiscalPeriods.start("missing-fiscal-period"),
      "starting a missing period is refused",
    );
    await checkRejectedWith(
      HTTP_NOT_FOUND,
      backend.entries.getAll("missing-fiscal-period"),
      "listing entries of a missing period is refused",
    );
  }),

  contractCase("keeps the opening balances it is given", async (backend) => {
    const created = await backend.fiscalPeriods.create(PERIOD_2026);
    await backend.fiscalPeriods.start(created.id);
    const balanceLines = [
      { id: `a:${CASH}`, accountId: `a:${CASH}`, amount: 100_000 },
      {
        id: `l:${OWNER_EQUITY}`,
        accountId: `l:${OWNER_EQUITY}`,
        amount: 100_000,
      },
    ];
    const patched = await backend.fiscalPeriods.patch(created.id, {
      openingBalancesCompleted: true,
      opening: { balanceLines, journals: [] },
    });
    check(patched.phase === "journalizing", "a started period is journalizing");
    check(patched.openingBalancesCompleted, "the opening is marked complete");
    check(
      JSON.stringify(patched.opening.balanceLines) ===
        JSON.stringify(balanceLines),
      "opening balance lines come back unchanged",
    );
    check(
      JSON.stringify(
        (await storedPeriod(backend, created.id)).opening.balanceLines,
      ) === JSON.stringify(balanceLines),
      "opening balance lines are stored",
    );
  }),

  contractCase("stores, changes and removes an entry", async (backend) => {
    const period = await journalizingPeriod(backend);
    const master = await loadJournalMaster(backend);
    const input = pairEntry(master, {
      date: "2026-03-01",
      description: "売上",
      debit: CASH,
      credit: SALES,
      amount: 1_200,
      localId: null,
    });

    const created = await backend.entries.create(period.id, input);
    check(created.fiscalPeriodId === period.id, "the entry keeps its period");
    check(created.lines.length === 2, "the entry keeps both lines");
    check(
      created.lines.every((line) => line.id.trim() !== ""),
      "stored lines have ids",
    );
    check(
      created.lines.every((line) => line.amount === 1_200),
      "stored amounts are unchanged",
    );

    const updated = await backend.entries.update(period.id, created.id, {
      ...input,
      description: "売上 (直し)",
    });
    check(updated.id === created.id, "an update keeps the entry id");
    const [stored, ...others] = await backend.entries.getAll(period.id);
    check(
      others.length === 0 &&
        stored?.id === created.id &&
        stored.description === "売上 (直し)",
      "an update is stored in place",
    );

    await backend.entries.remove(period.id, created.id);
    check(
      (await backend.entries.getAll(period.id)).length === 0,
      "a removed entry is gone",
    );
  }),

  contractCase(
    "refuses an entry outside the fiscal period",
    async (backend) => {
      const period = await journalizingPeriod(backend);
      const master = await loadJournalMaster(backend);
      await checkRejectedWith(
        HTTP_BAD_REQUEST,
        backend.entries.create(
          period.id,
          pairEntry(master, {
            date: "2027-01-01",
            description: "期間の外",
            debit: CASH,
            credit: SALES,
            amount: 100,
            localId: null,
          }),
        ),
        "an entry dated outside the period is refused",
      );
    },
  ),

  contractCase("refuses an entry whose sides differ", async (backend) => {
    const period = await journalizingPeriod(backend);
    const master = await loadJournalMaster(backend);
    const balanced = pairEntry(master, {
      date: "2026-03-01",
      description: "貸借が合わない",
      debit: CASH,
      credit: SALES,
      amount: 100,
      localId: null,
    });
    const [debit, credit] = balanced.lines;
    check(debit != null && credit != null, "the pair has two lines");
    await checkRejectedWith(
      HTTP_BAD_REQUEST,
      backend.entries.create(period.id, {
        ...balanced,
        lines: [debit, { ...credit, amount: 99 }],
      }),
      "an unbalanced entry is refused",
    );
  }),

  contractCase("imports an entry once per localId", async (backend) => {
    const period = await journalizingPeriod(backend);
    const master = await loadJournalMaster(backend);
    const entries = [
      pairEntry(master, {
        date: "2026-03-01",
        description: "一度目",
        debit: CASH,
        credit: SALES,
        amount: 100,
        localId: "import-1",
      }),
      pairEntry(master, {
        date: "2026-03-02",
        description: "二つ目",
        debit: CASH,
        credit: SALES,
        amount: 200,
        localId: "import-2",
      }),
    ];

    const first = await backend.entries.importMany(period.id, entries);
    check(first.importedCount === 2, "new localIds are imported");
    const second = await backend.entries.importMany(period.id, entries);
    check(second.importedCount === 0, "known localIds are skipped");
    check(
      (await backend.entries.getAll(period.id)).length === 2,
      "importing twice does not duplicate entries",
    );
  }),

  contractCase("keeps fixed assets per fiscal period", async (backend) => {
    const period = await journalizingPeriod(backend);
    const master = await loadJournalMaster(backend);
    const created = await backend.fixedAssets.create(period.id, {
      name: "ノートパソコン",
      acquisitionDate: "2026-01-10",
      acquisitionCost: 240_000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: accountId(master, EQUIPMENT),
    });
    check(created.status === "active", "a new fixed asset is active");
    const otherPeriod = await backend.fiscalPeriods.create(PERIOD_2027);
    check(
      (await backend.fixedAssets.getAll(period.id)).length === 1 &&
        (await backend.fixedAssets.getAll(otherPeriod.id)).length === 0,
      "a fixed asset belongs to its fiscal period only",
    );

    const patched = await backend.fixedAssets.patch(period.id, created.id, {
      name: "パソコン",
    });
    check(patched.name === "パソコン", "a fixed asset patch is stored");
    check(
      patched.acquisitionCost === 240_000,
      "a patch leaves other fields unchanged",
    );

    await backend.fixedAssets.remove(period.id, created.id);
    check(
      (await backend.fixedAssets.getAll(period.id)).length === 0,
      "a removed fixed asset is gone",
    );
  }),

  contractCase("moves into pre-closing and back", async (backend) => {
    const period = await journalizingPeriod(backend);
    const preClosed = await backend.preClosings.run(period.id);
    check(preClosed.phase === "pre_closing", "pre-closing sets the phase");
    const reopened = await backend.preClosings.cancel(period.id);
    check(
      reopened.phase === "journalizing",
      "cancelling returns to journalizing",
    );
  }),

  contractCase(
    "accepts the closing entries the driver builds",
    async (backend) => {
      const period = await journalizingPeriod(backend);
      const master = await loadJournalMaster(backend);
      await backend.entries.create(
        period.id,
        pairEntry(master, {
          date: "2026-03-01",
          description: "売上",
          debit: CASH,
          credit: SALES,
          amount: 500_000,
          localId: null,
        }),
      );
      await backend.fixedAssets.create(period.id, {
        name: "ノートパソコン",
        acquisitionDate: "2026-01-10",
        acquisitionCost: 240_000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: accountId(master, EQUIPMENT),
      });
      const preClosed = await backend.preClosings.run(period.id);

      await checkRejectedWith(
        HTTP_CONFLICT,
        backend.closings.run(period.id, []),
        "closing entries that differ from the backend's calculation are refused",
      );

      const closingEntries = buildFinalClosingPayload(
        await loadFiscalPeriodReportInput(backend, preClosed, CLOSING_DAY),
        master,
      );
      check(
        closingEntries.length > 0,
        "the driver builds closing entries for depreciation",
      );
      const closed = await backend.closings.run(period.id, closingEntries);
      check(closed.phase === "post_closing", "closing sets the phase");
      check(
        (await backend.entries.getAll(period.id)).length ===
          1 + closingEntries.length,
        "the closing entries are stored with the period's entries",
      );

      await checkRejectedWith(
        HTTP_CONFLICT,
        backend.entries.create(
          period.id,
          pairEntry(master, {
            date: "2026-04-01",
            description: "締めたあと",
            debit: CASH,
            credit: SALES,
            amount: 100,
            localId: null,
          }),
        ),
        "a closed period refuses new entries",
      );
    },
  ),

  contractCase("creates the next period from a closed one", async (backend) => {
    const period = await closedPeriodWithFixedAsset(backend);

    const next = await backend.fiscalPeriods.createNext({
      sourceFiscalPeriodId: period.id,
      ...PERIOD_2027,
      carryBalances: true,
      reversalEntryIds: [],
      carryFixedAssets: true,
    });

    check(
      next.startDate === PERIOD_2027.startDate,
      "the next period starts where asked",
    );
    check(next.phase === "pre_opening", "the next period is not opened yet");
    check(
      openingCashOf(next) === OPENING_CASH + SALES_IN_CASH,
      "the next period opens with the closing balance, not the previous opening",
    );
    check(
      (await backend.fixedAssets.getAll(next.id)).length === 1,
      "the next period carries the fixed assets",
    );
  }),

  contractCase(
    "carries over into an opened period by replacing what it had",
    async (backend) => {
      const source = await closedPeriodWithFixedAsset(backend);
      const master = await loadJournalMaster(backend);
      const created = await backend.fiscalPeriods.create(PERIOD_2027);
      await backend.fiscalPeriods.start(created.id);
      await backend.fixedAssets.create(created.id, {
        name: "引き継ぐ前の資産",
        acquisitionDate: "2027-01-10",
        acquisitionCost: 120_000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: accountId(master, EQUIPMENT),
      });
      const carryover = {
        sourceFiscalPeriodId: source.id,
        carryBalances: true,
        reversalEntryIds: null,
        carryFixedAssets: true,
      };

      await backend.fiscalPeriods.applyCarryover(created.id, carryover);
      const carried = await backend.fiscalPeriods.applyCarryover(
        created.id,
        carryover,
      );

      check(
        openingCashOf(carried) === OPENING_CASH + SALES_IN_CASH &&
          openingCashOf(await storedPeriod(backend, created.id)) ===
            OPENING_CASH + SALES_IN_CASH,
        "the opened period takes the source's closing balance",
      );
      const fixedAssets = await backend.fixedAssets.getAll(created.id);
      check(
        fixedAssets.length === 1 && fixedAssets[0]?.name === "ノートパソコン",
        "the carried fixed assets replace the ones the period had, without duplicates",
      );
      await checkRejectedWith(
        HTTP_CONFLICT,
        backend.fiscalPeriods.applyCarryover(source.id, {
          ...carryover,
          sourceFiscalPeriodId: created.id,
        }),
        "a closed period refuses a carryover",
      );
    },
  ),

  contractCase(
    "removes a fiscal period only before it is opened",
    async (backend) => {
      const unopened = await backend.fiscalPeriods.create(PERIOD_2027);
      await backend.fiscalPeriods.remove(unopened.id);
      check(
        (await backend.fiscalPeriods.getAll()).length === 0,
        "a removed period is gone",
      );

      const opened = await journalizingPeriod(backend);
      await checkRejectedWith(
        HTTP_CONFLICT,
        backend.fiscalPeriods.remove(opened.id),
        "an opened period refuses removal",
      );
      check(
        (await backend.fiscalPeriods.getAll()).length === 1,
        "the opened period is still there",
      );
    },
  ),

  {
    name: "takes in a fiscal period copied from another backend",
    async run(open) {
      await withSubject(open, async (source) => {
        const period = await closedPeriodWithFixedAsset(source);
        await withSubject(open, async (target) => {
          const copied = await copyFiscalPeriodToBackend(
            source,
            period,
            target,
            CLOSING_DAY,
          );
          check(
            copied.name === period.name && copied.phase === "post_closing",
            "the copied period keeps its name and phase",
          );
          check(
            (await target.entries.getAll(copied.id)).length ===
              (await source.entries.getAll(period.id)).length,
            "the copied period keeps its entries",
          );
          check(
            (await target.fixedAssets.getAll(copied.id)).length === 1,
            "the copied period keeps its fixed assets",
          );
          await checkRejectedWith(
            HTTP_CONFLICT,
            copyFiscalPeriodToBackend(source, period, target, CLOSING_DAY),
            "a copy that overlaps a stored period is refused",
          );
        });
      });
    },
  },

  contractCase("reports its maintenance status", async (backend) => {
    const status = await backend.maintenance.get();
    check(
      typeof status.enabled === "boolean",
      "maintenance has an enabled flag",
    );
  }),
];
