"use client";

import { useMemo } from "react";

import { usePrintDocument } from "../../../bindings/index.js";
import { PreviewScaffold } from "../preview-scaffold.js";
import {
  buildJournalBody,
  buildJournalDocument,
  JOURNAL_EXAMPLE_ENTRIES,
} from "@rubydogjp/openkk-driver";

export function JournalPaperTemplatePage() {
  const printDocument = usePrintDocument();
  const bodyHtml = useMemo(() => buildJournalBody(JOURNAL_EXAMPLE_ENTRIES), []);

  return (
    <PreviewScaffold
      title="仕訳帳 (テンプレート + 例の値)"
      bodyHtml={bodyHtml}
      onPrint={() =>
        printDocument(buildJournalDocument(JOURNAL_EXAMPLE_ENTRIES))
      }
    />
  );
}
