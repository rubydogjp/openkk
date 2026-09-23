import type {
  EntryDbSide,
  FiscalPeriodOpeningDbRecord,
  OpeningJournalDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { validateOpeningDbRecord } from "./persistence-codec.js";
import type { SqlDb } from "./sql-db.js";

export function emptyOpening(): FiscalPeriodOpeningDbRecord {
  return { openingBalanceLines: [], openingJournals: [] };
}

export async function loadOpeningsByUser(
  db: SqlDb,
  userId: string,
): Promise<Map<string, FiscalPeriodOpeningDbRecord>> {
  return loadOpenings(db, "fp.user_id = ?", userId);
}

export async function loadOpeningByFiscalPeriod(
  db: SqlDb,
  fiscalPeriodId: string,
): Promise<FiscalPeriodOpeningDbRecord> {
  const openings = await loadOpenings(db, "fp.id = ?", fiscalPeriodId);
  return openings.get(fiscalPeriodId) ?? emptyOpening();
}

export async function replaceOpening(
  db: SqlDb,
  fiscalPeriodId: string,
  opening: FiscalPeriodOpeningDbRecord,
): Promise<void> {
  for (const table of [
    "opening_journal_lines",
    "opening_journals",
    "opening_balance_lines",
  ]) {
    await db.exec({
      sql: `DELETE FROM ${table} WHERE fiscal_period_id = ?`,
      bind: [fiscalPeriodId],
    });
  }
  for (const [position, line] of opening.openingBalanceLines.entries()) {
    await db.exec({
      sql: `INSERT INTO opening_balance_lines(fiscal_period_id, id, account_id, amount, position)
        VALUES(?, ?, ?, ?, ?)`,
      bind: [fiscalPeriodId, line.id, line.accountId, line.amount, position],
    });
  }
  for (const [position, journal] of opening.openingJournals.entries()) {
    await db.exec({
      sql: `INSERT INTO opening_journals(
        fiscal_period_id, id, date, description, business_rate, position
      ) VALUES(?, ?, ?, ?, ?, ?)`,
      bind: [
        fiscalPeriodId,
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
          fiscal_period_id, opening_journal_id, id, side, book_account_id, amount,
          partner_name, tax_category_id, business_category_id, position
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          fiscalPeriodId,
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
  db: SqlDb,
  where: "fp.user_id = ?" | "fp.id = ?",
  value: string,
): Promise<Map<string, FiscalPeriodOpeningDbRecord>> {
  const result = new Map<string, FiscalPeriodOpeningDbRecord>();
  const openingFor = (fiscalPeriodId: string) => {
    let opening = result.get(fiscalPeriodId);
    if (opening == null) {
      opening = emptyOpening();
      result.set(fiscalPeriodId, opening);
    }
    return opening;
  };

  const balanceRows = (await db.exec({
    sql: `SELECT line.fiscal_period_id, line.id, line.account_id, line.amount
      FROM opening_balance_lines line
      JOIN fiscal_periods fp ON fp.id = line.fiscal_period_id
      WHERE ${where}
      ORDER BY line.fiscal_period_id, line.position, line.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, string, number]>;
  for (const [fiscalPeriodId, id, accountId, amount] of balanceRows) {
    openingFor(fiscalPeriodId).openingBalanceLines.push({
      id,
      accountId,
      amount,
    });
  }

  const journalRows = (await db.exec({
    sql: `SELECT journal.fiscal_period_id, journal.id, journal.date,
        journal.description, journal.business_rate
      FROM opening_journals journal
      JOIN fiscal_periods fp ON fp.id = journal.fiscal_period_id
      WHERE ${where}
      ORDER BY journal.fiscal_period_id, journal.position, journal.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, string, string, number]>;
  const journals = new Map<string, OpeningJournalDbRecord>();
  for (const [
    fiscalPeriodId,
    id,
    date,
    description,
    businessRate,
  ] of journalRows) {
    const journal: OpeningJournalDbRecord = {
      id,
      date,
      description,
      businessRate,
      lines: [],
    };
    journals.set(journalKey(fiscalPeriodId, id), journal);
    openingFor(fiscalPeriodId).openingJournals.push(journal);
  }

  const lineRows = (await db.exec({
    sql: `SELECT line.fiscal_period_id, line.opening_journal_id, line.id, line.side,
        line.book_account_id, line.amount, line.partner_name,
        line.tax_category_id, line.business_category_id
      FROM opening_journal_lines line
      JOIN fiscal_periods fp ON fp.id = line.fiscal_period_id
      WHERE ${where}
      ORDER BY line.fiscal_period_id, line.opening_journal_id, line.position, line.id`,
    bind: [value],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<
    [
      string,
      string,
      string,
      EntryDbSide,
      string,
      number,
      string,
      string,
      string,
    ]
  >;
  for (const [
    fiscalPeriodId,
    openingJournalId,
    id,
    side,
    bookAccountId,
    amount,
    partnerName,
    taxCategoryId,
    businessCategoryId,
  ] of lineRows) {
    const journal = journals.get(journalKey(fiscalPeriodId, openingJournalId));
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
  for (const opening of result.values()) {
    validateOpeningDbRecord(opening);
  }
  return result;
}

function journalKey(fiscalPeriodId: string, journalId: string): string {
  return `${fiscalPeriodId}\u0000${journalId}`;
}
