import type {
  OpeningJournalDbRecord,
  FiscalPeriodOpeningDbRecord,
} from "../persistence-types";
import { msToIso, validateOpeningDbRecord } from "./persistence-codec";

type OpeningSqlDb = {
  exec(
    arg:
      | string
      | {
          sql: string;
          bind?: unknown[];
          returnValue?: string;
          rowMode?: string;
        },
  ): Promise<unknown>;
};

export function defaultOpening(
  userId: string,
  fiscalPeriodId: string,
  nowMs: number,
): FiscalPeriodOpeningDbRecord {
  const timestamp = msToIso(nowMs);
  return {
    id: `op-${fiscalPeriodId}`,
    userId,
    fiscalPeriodId,
    createdAt: timestamp,
    updatedAt: timestamp,
    openingBalanceLines: [],
    openingJournals: [],
  };
}

export async function loadOpeningsByUser(
  db: OpeningSqlDb,
  userId: string,
): Promise<Map<string, FiscalPeriodOpeningDbRecord>> {
  return loadOpenings(db, "fp.user_id = ?", userId);
}

export async function loadOpeningByFiscalPeriod(
  db: OpeningSqlDb,
  fiscalPeriodId: string,
): Promise<FiscalPeriodOpeningDbRecord | null> {
  const openings = await loadOpenings(
    db,
    "o.fiscal_period_id = ?",
    fiscalPeriodId,
  );
  return openings.get(fiscalPeriodId) ?? null;
}

export async function replaceOpening(
  db: OpeningSqlDb,
  opening: FiscalPeriodOpeningDbRecord,
  now: number,
): Promise<void> {
  validateOpeningDbRecord(opening);
  await db.exec({
    sql: `DELETE FROM openings WHERE fiscal_period_id = ?`,
    bind: [opening.fiscalPeriodId],
  });
  await db.exec({
    sql: `INSERT INTO openings(id, fiscal_period_id, created_at, updated_at)
      VALUES(?, ?, ?, ?)`,
    bind: [opening.id, opening.fiscalPeriodId, now, now],
  });
  for (const [position, line] of (
    opening.openingBalanceLines ?? []
  ).entries()) {
    await db.exec({
      sql: `INSERT INTO opening_balance_lines(opening_id, id, account_id, amount, position)
        VALUES(?, ?, ?, ?, ?)`,
      bind: [opening.id, line.id, line.accountId, line.amount, position],
    });
  }
  for (const [position, journal] of (opening.openingJournals ?? []).entries()) {
    await db.exec({
      sql: `INSERT INTO opening_journals(
        opening_id, id, date, description, business_rate, position
      ) VALUES(?, ?, ?, ?, ?, ?)`,
      bind: [
        opening.id,
        journal.id,
        journal.date,
        journal.description,
        journal.businessRate,
        position,
      ],
    });
    for (const [linePosition, line] of journal.lines.entries()) {
      await db.exec({
        sql: `INSERT INTO opening_journal_lines(
          opening_id, opening_journal_id, id, side, book_account_id, amount,
          partner_name, tax_category_id, business_category_id, position
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          opening.id,
          journal.id,
          line.id,
          line.side,
          line.bookAccountId,
          line.amount,
          line.partnerName,
          line.taxCategoryId,
          line.businessCategoryId,
          linePosition,
        ],
      });
    }
  }
}

async function loadOpenings(
  db: OpeningSqlDb,
  where: "fp.user_id = ?" | "o.fiscal_period_id = ?",
  value: string,
): Promise<Map<string, FiscalPeriodOpeningDbRecord>> {
  const openingRows = (await db.exec({
    sql: `SELECT o.id, fp.user_id, o.fiscal_period_id, o.created_at, o.updated_at
      FROM openings o
      JOIN fiscal_periods fp ON fp.id = o.fiscal_period_id
      WHERE ${where}
      ORDER BY o.fiscal_period_id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, string, number, number]>;
  const result = new Map<string, FiscalPeriodOpeningDbRecord>();
  const openingIdToPeriodId = new Map<string, string>();
  for (const [id, userId, fiscalPeriodId, createdAt, updatedAt] of openingRows) {
    result.set(fiscalPeriodId, {
      id,
      userId,
      fiscalPeriodId,
      createdAt: msToIso(createdAt),
      updatedAt: msToIso(updatedAt),
      openingBalanceLines: [],
      openingJournals: [],
    });
    openingIdToPeriodId.set(id, fiscalPeriodId);
  }
  if (openingRows.length === 0) return result;

  const balanceRows = (await db.exec({
    sql: `SELECT line.opening_id, line.id, line.account_id, line.amount
      FROM opening_balance_lines line
      JOIN openings o ON o.id = line.opening_id
      JOIN fiscal_periods fp ON fp.id = o.fiscal_period_id
      WHERE ${where}
      ORDER BY line.opening_id, line.position, line.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, string, number]>;
  for (const [openingId, id, accountId, amount] of balanceRows) {
    const opening = openingForId(result, openingIdToPeriodId, openingId);
    opening.openingBalanceLines!.push({ id, accountId, amount });
  }

  const journalRows = (await db.exec({
    sql: `SELECT journal.opening_id, journal.id, journal.date,
        journal.description, journal.business_rate
      FROM opening_journals journal
      JOIN openings o ON o.id = journal.opening_id
      JOIN fiscal_periods fp ON fp.id = o.fiscal_period_id
      WHERE ${where}
      ORDER BY journal.opening_id, journal.position, journal.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, string, string, number]>;
  const journals = new Map<string, OpeningJournalDbRecord>();
  for (const [openingId, id, date, description, businessRate] of journalRows) {
    const journal: OpeningJournalDbRecord = {
      id,
      date,
      description,
      businessRate,
      lines: [],
    };
    journals.set(journalKey(openingId, id), journal);
    openingForId(result, openingIdToPeriodId, openingId).openingJournals!.push(
      journal,
    );
  }

  const lineRows = (await db.exec({
    sql: `SELECT line.opening_id, line.opening_journal_id, line.id, line.side,
        line.book_account_id, line.amount, line.partner_name,
        line.tax_category_id, line.business_category_id
      FROM opening_journal_lines line
      JOIN openings o ON o.id = line.opening_id
      JOIN fiscal_periods fp ON fp.id = o.fiscal_period_id
      WHERE ${where}
      ORDER BY line.opening_id, line.opening_journal_id, line.position, line.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<
    [
      string,
      string,
      string,
      "debit" | "credit",
      string,
      number,
      string,
      string,
      string,
    ]
  >;
  for (const row of lineRows) {
    const [
      openingId,
      openingJournalId,
      id,
      side,
      bookAccountId,
      amount,
      partnerName,
      taxCategoryId,
      businessCategoryId,
    ] = row;
    const journal = journals.get(journalKey(openingId, openingJournalId));
    if (journal == null)
      throw new Error(`opening journal not found: ${openingJournalId}`);
    journal.lines.push({
      id,
      side,
      bookAccountId,
      amount,
      partnerName,
      taxCategoryId,
      businessCategoryId,
    });
  }
  return result;
}

function openingForId(
  openings: Map<string, FiscalPeriodOpeningDbRecord>,
  openingIdToPeriodId: Map<string, string>,
  openingId: string,
): FiscalPeriodOpeningDbRecord {
  const fiscalPeriodId = openingIdToPeriodId.get(openingId);
  const opening = fiscalPeriodId == null ? null : openings.get(fiscalPeriodId);
  if (opening == null) throw new Error(`opening not found: ${openingId}`);
  return opening;
}

function journalKey(openingId: string, journalId: string): string {
  return `${openingId}\u0000${journalId}`;
}
