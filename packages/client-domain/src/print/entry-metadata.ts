import type { EntryLineMetadata } from "../entries/entry-record.js";

export function formatEntryMetadata(metadata: EntryLineMetadata): string {
  return [
    metadata.partner.trim() === "" ? "" : `取引先: ${metadata.partner}`,
    metadata.taxCategory.trim() === ""
      ? ""
      : `税区分: ${metadata.taxCategory}`,
    metadata.businessCategory.trim() === ""
      ? ""
      : `事業区分: ${metadata.businessCategory}`,
  ]
    .filter((value) => value !== "")
    .join(" / ");
}
