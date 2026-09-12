import { describe, expect, it } from "vitest";

import type { EntryRecord } from "@rubydogjp/openkk-client-domain";

import {
  entryFormStateToEntryDraft,
  entryRecordToDraft,
  entryToFormState,
} from "./entry-edit-model.js";

describe("entry edit model", () => {
  it("keeps surviving line identities after removing an earlier row", () => {
    const record: EntryRecord = {
      id: "opening-1",
      fiscalPeriodId: "fp-1",
      date: "2026-01-01",
      weekday: "木",
      description: "複合再振替",
      businessRate: 1,
      lines: [
        {
          id: "line-rent",
          side: "debit",
          accountName: "地代家賃",
          accountType: "expense",
          amount: "80,000",
          bookAccountId: "expense-rent",
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          id: "line-fee",
          side: "debit",
          accountName: "支払手数料",
          accountType: "expense",
          amount: "20,000",
          bookAccountId: "expense-fee",
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          id: "line-cash",
          side: "credit",
          accountName: "現金",
          accountType: "asset",
          amount: "80,000",
          bookAccountId: "asset-cash",
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          id: "line-bank",
          side: "credit",
          accountName: "普通預金",
          accountType: "asset",
          amount: "20,000",
          bookAccountId: "asset-bank",
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
      localId: null,
    };
    let pairSequence = 0;
    const formState = entryToFormState(
      entryRecordToDraft(record),
      () => `pair-${++pairSequence}`,
    );
    const edited = entryFormStateToEntryDraft(
      { ...formState, pairs: formState.pairs.slice(1) },
      [
        {
          id: "expense-rent",
          name: "地代家賃",
          accountType: "expense",
          selectionLabel: "地代家賃",
          balanceSheetSection: "none",
        },
        {
          id: "expense-fee",
          name: "支払手数料",
          accountType: "expense",
          selectionLabel: "支払手数料",
          balanceSheetSection: "none",
        },
        {
          id: "asset-cash",
          name: "現金",
          accountType: "asset",
          selectionLabel: "現金",
          balanceSheetSection: "current_asset",
        },
        {
          id: "asset-bank",
          name: "普通預金",
          accountType: "asset",
          selectionLabel: "普通預金",
          balanceSheetSection: "current_asset",
        },
      ],
    );

    expect(edited.lines.map((line) => line.id)).toEqual([
      "line-fee",
      "line-bank",
    ]);
  });
});
