import type { InspectedBookPeriod } from "@rubydogjp/openkk-books-db-adapter";
import type { OpenkkBookImportCase } from "@rubydogjp/openkk-driver";

export function bookImportCase(
  period: Pick<InspectedBookPeriod, "lastChangedAt" | "relation">,
  savedLastChangedAt: number | null,
): OpenkkBookImportCase {
  const { relation } = period;
  if (relation.kind !== "same_period") return relation.kind;
  const inFile = period.lastChangedAt;
  const inApp = relation.existingLastChangedAt;
  if (inFile === inApp) return "same";
  const changedInApp =
    savedLastChangedAt == null || inApp !== savedLastChangedAt;
  const changedOutside =
    inFile != null && inFile > (savedLastChangedAt ?? inApp);
  if (!changedOutside) return "replaces_app_changes";
  return changedInApp ? "changed_both" : "changed_outside";
}
