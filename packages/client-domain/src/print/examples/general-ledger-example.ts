

import type { OpeningBalanceLine } from "../../shared/models.js";
import {
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_FP_NAME,
} from "./journal-example.js";

export const GENERAL_LEDGER_EXAMPLE_FP_NAME = JOURNAL_EXAMPLE_FP_NAME;
export const GENERAL_LEDGER_EXAMPLE_ENTRIES = JOURNAL_EXAMPLE_ENTRIES;

export const GENERAL_LEDGER_EXAMPLE_OPENING_BALANCE_LINES: OpeningBalanceLine[] = [
  { id: "a:現金", accountId: "a:現金", amount: 50000 },
  { id: "a:普通預金", accountId: "a:普通預金", amount: 1500000 },
  { id: "a:工具器具備品", accountId: "a:工具器具備品", amount: 200000 },
  { id: "l:元入金", accountId: "l:元入金", amount: 1750000 },
];
