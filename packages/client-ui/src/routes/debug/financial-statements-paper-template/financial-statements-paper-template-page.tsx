"use client";

import { useMemo } from "react";

import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { PreviewScaffold } from "../../../print/preview-scaffold";
import {
  buildFinancialStatementsBody,
  buildFinancialStatementsDocument,
} from "@rubydogjp/openkk-client-domain";
import {
  FINANCIAL_STATEMENTS_EXAMPLE_AMOUNTS,
  FINANCIAL_STATEMENTS_EXAMPLE_BS_ROWS,
  FINANCIAL_STATEMENTS_EXAMPLE_FP_NAME,
} from "@rubydogjp/openkk-client-domain";

export function FinancialStatementsPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const args = useMemo(
    () => ({
      fpName: FINANCIAL_STATEMENTS_EXAMPLE_FP_NAME,
      amounts: FINANCIAL_STATEMENTS_EXAMPLE_AMOUNTS,
      bsRows: FINANCIAL_STATEMENTS_EXAMPLE_BS_ROWS,
    }),
    [],
  );

  const bodyHtml = useMemo(() => buildFinancialStatementsBody(args), [args]);

  return (
    <PreviewScaffold
      title="財務諸表 (テンプレート + 例の値)"
      orientation="landscape"
      notice="このページはテンプレート + 固定の例の値の表示確認用です。実際の期間データは使用しません。"
      bodyHtml={bodyHtml}
      fpName={FINANCIAL_STATEMENTS_EXAMPLE_FP_NAME}
      onPrint={() => printDocument(buildFinancialStatementsDocument(args))}
    />
  );
}
