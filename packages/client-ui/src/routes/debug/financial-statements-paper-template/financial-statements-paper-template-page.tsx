"use client";

import { useMemo } from "react";

import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { PreviewScaffold } from "../preview-scaffold.js";
import {
  buildFinancialStatementsBody,
  buildFinancialStatementsDocument,
  computeFsAggregate,
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
} from "@rubydogjp/openkk-client-domain";

export function FinancialStatementsPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const aggregate = useMemo(
    () =>
      computeFsAggregate({
        entries: JOURNAL_EXAMPLE_ENTRIES,
        openingBalanceLines: JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
      }),
    [],
  );

  const bodyHtml = useMemo(
    () => buildFinancialStatementsBody(aggregate),
    [aggregate],
  );

  return (
    <PreviewScaffold
      title="財務諸表 (テンプレート + 例の値)"
      bodyHtml={bodyHtml}
      onPrint={() => printDocument(buildFinancialStatementsDocument(aggregate))}
    />
  );
}
