"use client";

import {
  computeFsAggregate,
  JOURNAL_EXAMPLE_ENTRIES,
  JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
} from "@rubydogjp/openkk-client-domain";

import { palette, typography } from "../../../shared/design-tokens.js";
import { PlBsDiagramSection } from "../../../shared/pl-bs-diagram.js";

const EXAMPLE_SUMMARY = computeFsAggregate({
  entries: JOURNAL_EXAMPLE_ENTRIES,
  openingBalanceLines: JOURNAL_EXAMPLE_OPENING_BALANCE_LINES,
}).summary;

export function PlBsDiagramPreviewPage() {
  return (
    <section style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: typography.pageTitle.fontSize }}>
          PL / BS 図プレビュー
        </h1>
        <p style={{ margin: "10px 0 20px", color: palette.textSoft }}>
          固定の例の値で PL / BS 図を表示します。実際の期間データは使用しません。
        </p>
        <PlBsDiagramSection pl={EXAMPLE_SUMMARY} bs={EXAMPLE_SUMMARY} />
      </div>
    </section>
  );
}
