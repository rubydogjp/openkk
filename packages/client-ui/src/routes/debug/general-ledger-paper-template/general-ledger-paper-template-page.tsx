"use client";

import { useMemo } from "react";

import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { PreviewScaffold } from "../../../print/preview-scaffold";
import {
  buildGeneralLedgerBody,
  buildGeneralLedgerDocument,
} from "@rubydogjp/openkk-client-domain";
import {
  GENERAL_LEDGER_EXAMPLE_ENTRIES,
  GENERAL_LEDGER_EXAMPLE_FP_NAME,
  GENERAL_LEDGER_EXAMPLE_OPENING_BALANCE_LINES,
} from "@rubydogjp/openkk-client-domain";

export function GeneralLedgerPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const bodyHtml = useMemo(
    () =>
      buildGeneralLedgerBody(
        GENERAL_LEDGER_EXAMPLE_FP_NAME,
        GENERAL_LEDGER_EXAMPLE_ENTRIES,
        GENERAL_LEDGER_EXAMPLE_OPENING_BALANCE_LINES,
      ),
    [],
  );

  return (
    <PreviewScaffold
      title="総勘定元帳 (テンプレート + 例の値)"
      orientation="portrait"
      notice="このページはテンプレート + 固定の例の値の表示確認用です。実際の期間データは使用しません。"
      bodyHtml={bodyHtml}
      fpName={GENERAL_LEDGER_EXAMPLE_FP_NAME}
      onPrint={() =>
        printDocument(
          buildGeneralLedgerDocument(
            GENERAL_LEDGER_EXAMPLE_FP_NAME,
            GENERAL_LEDGER_EXAMPLE_ENTRIES,
            GENERAL_LEDGER_EXAMPLE_OPENING_BALANCE_LINES,
          ),
        )
      }
    />
  );
}
