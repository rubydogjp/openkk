

import type { OpeningBalanceLine } from "../fs-data";
import {
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_FP_NAME,
} from "./journal-example";

export const GENERAL_LEDGER_EXAMPLE_FP_NAME = JOURNAL_EXAMPLE_FP_NAME;
export const GENERAL_LEDGER_EXAMPLE_ENTRIES = JOURNAL_EXAMPLE_ENTRIES;

export const GENERAL_LEDGER_EXAMPLE_OPENING_BALANCE_LINES: OpeningBalanceLine[] = [
  { accountId: "a:現金", amount: 50000 },
  { accountId: "a:普通預金", amount: 1500000 },
  { accountId: "a:工具器具備品", amount: 200000 },
  { accountId: "l:元入金", amount: 1750000 },
];
