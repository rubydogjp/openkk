export type StepStatus = "todo" | "doing" | "done";

export type StepItem = {
  no: number;
  title: string;
  subtitle: string;
  status: StepStatus;
};

export function deriveSteps(input: {
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  hasAnyClosing: boolean;
  hasFinalClosing: boolean;
  hasReceivedDocuments: boolean;
}): StepItem[] {
  const statuses = deriveContiguousStepStatuses([
    input.settingsCompleted,
    input.openingBalancesCompleted,
    input.hasAnyClosing,
    input.hasFinalClosing,
    input.hasReceivedDocuments,
    false,
  ]);
  return [
    { no: 1, title: "期間を開始", subtitle: "名称や期間などの基本データをセットアップ", status: statuses[0]! },
    { no: 2, title: "期首のBSを入力", subtitle: "はじめに持っていた事業資産のデータ", status: statuses[1]! },
    { no: 3, title: "日々の仕訳", subtitle: "全ての取引を仕訳として記録します", status: statuses[2]! },
    { no: 4, title: "本締め", subtitle: "それでは今期の決算を確定します", status: statuses[3]! },
    { no: 5, title: "書類を受け取る", subtitle: "確定申告に使う書類がここで手に入ります", status: statuses[4]! },
    { no: 6, title: "次の期間へ", subtitle: "引き継ぐデータを選択します", status: statuses[5]! },
  ];
}

function deriveContiguousStepStatuses(rawDoneFlags: boolean[]): StepStatus[] {
  if (rawDoneFlags.length === 0) return [];
  const statuses: StepStatus[] = [];
  let blocked = false;
  for (const isRawDone of rawDoneFlags) {
    if (blocked) {
      statuses.push("todo");
      continue;
    }
    if (isRawDone) {
      statuses.push("done");
      continue;
    }
    statuses.push("doing");
    blocked = true;
  }
  return statuses;
}
