import type { FiscalPeriod } from "./models";

export function isJournalingActive(
  period: FiscalPeriod | null | undefined,
): boolean {
  if (period == null) return false;
  if (period.stage !== "journalizing") return false;
  if (period.provisionalClosingCompleted) return false;
  return true;
}

export type PeriodLockMessage = { title: string; description: string };

export function buildPeriodLockMessage(
  period: FiscalPeriod | null | undefined,
  subjectVerb: string = "編集できます",
): PeriodLockMessage | null {
  if (period == null) {
    return { title: "ロックされています", description: "期間が未選択です" };
  }
  if (period.stage === "pre_opening") {
    return {
      title: "ロックされています",
      description: `期間を開始後に${subjectVerb}`,
    };
  }
  if (period.stage === "post_closing") {
    return {
      title: "ロックされています",
      description: "本締め以降は編集できません",
    };
  }
  if (period.provisionalClosingCompleted) {
    return {
      title: "ロックされています",
      description: "仮締め以降は編集できません",
    };
  }
  return null;
}
