import {
  AppError,
  type OpenkkEditingPolicy,
} from "@rubydogjp/openkk-client-domain";

export function assertEditingUnlocked(
  editingPolicy: OpenkkEditingPolicy,
  operation: string,
): void {
  if (!editingPolicy.locked) return;

  throw new AppError({
    messageForDeveloper: `${operation}: editing is locked by configuration`,
    messageForUser:
      editingPolicy.lockedNotice ??
      "この環境ではデータの編集がロックされています",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
