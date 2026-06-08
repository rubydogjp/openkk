import type { FiscalPeriod } from "./models";

export function isJournalizingActive(
  period: FiscalPeriod | null | undefined,
): boolean {
  if (period == null) return false;
  return period.archiveStatus === "active" && period.phase === "journalizing";
}

export function isArchivedStub(
  period: FiscalPeriod | null | undefined,
): boolean {
  if (period == null) return false;
  return (
    period.archiveStatus === "archived" && period.archiveDataAvailable === false
  );
}

export type PeriodLockMessage = { title: string; description: string };

export function buildPeriodLockMessage(
  period: FiscalPeriod | null | undefined,
  subjectVerb: string = "編集できます",
): PeriodLockMessage | null {
  if (period == null) {
    return { title: "ロックされています", description: "期間が未選択です" };
  }
  if (period.archiveStatus === "archived") {
    return {
      title: "圧縮保存済みです",
      description: "圧縮保存済みの会計期間は編集できません",
    };
  }
  if (period.phase === "pre_opening") {
    return {
      title: "ロックされています",
      description: `期間を開始後に${subjectVerb}`,
    };
  }
  if (period.phase === "post_closing") {
    return {
      title: "ロックされています",
      description: "本締め以降は編集できません",
    };
  }
  if (period.phase === "pre_closing") {
    return {
      title: "ロックされています",
      description: "仮締め以降は編集できません",
    };
  }
  return null;
}
