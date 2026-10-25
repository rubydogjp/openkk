"use client";

import { useMemo } from "react";

import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { PreviewScaffold } from "../preview-scaffold.js";
import {
  buildGeneralLedgerBody,
  buildGeneralLedgerDocument,
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
} from "@rubydogjp/openkk-client-domain";

export function GeneralLedgerPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const bodyHtml = useMemo(
    () =>
      buildGeneralLedgerBody(
        JOURNAL_EXAMPLE_ENTRIES,
        JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
      ),
    [],
  );

  return (
    <PreviewScaffold
      title="総勘定元帳 (テンプレート + 例の値)"
      bodyHtml={bodyHtml}
      onPrint={() =>
        printDocument(
          buildGeneralLedgerDocument(
            JOURNAL_EXAMPLE_ENTRIES,
            JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
          ),
        )
      }
    />
  );
}
