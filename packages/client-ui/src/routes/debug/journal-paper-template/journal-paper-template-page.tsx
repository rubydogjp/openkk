"use client";

import { useMemo } from "react";

import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { PreviewScaffold } from "../../../print/preview-scaffold";
import {
  buildJournalBody,
  buildJournalDocument,
} from "@rubydogjp/openkk-client-domain";
import {
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_FP_NAME,
} from "@rubydogjp/openkk-client-domain";

export function JournalPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const bodyHtml = useMemo(
    () => buildJournalBody(JOURNAL_EXAMPLE_FP_NAME, JOURNAL_EXAMPLE_ENTRIES),
    [],
  );

  return (
    <PreviewScaffold
      title="仕訳帳 (テンプレート + 例の値)"
      orientation="portrait"
      notice="このページはテンプレート + 固定の例の値の表示確認用です。実際の期間データは使用しません。"
      bodyHtml={bodyHtml}
      fpName={JOURNAL_EXAMPLE_FP_NAME}
      onPrint={() =>
        printDocument(
          buildJournalDocument(
            JOURNAL_EXAMPLE_FP_NAME,
            JOURNAL_EXAMPLE_ENTRIES,
          ),
        )
      }
    />
  );
}
