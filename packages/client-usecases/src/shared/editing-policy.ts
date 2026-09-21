import {
  AppError,
  resolveEditingPolicy,
  type OpenkkEditingPolicy,
} from "@rubydogjp/openkk-client-domain";

export function assertEditingUnlocked(
  editingPolicy: OpenkkEditingPolicy | null,
  operation: string,
): void {
  const policy = resolveEditingPolicy(editingPolicy);
  if (!policy.locked) return;

  throw new AppError({
    messageForDeveloper: `${operation}: editing is locked by configuration`,
    messageForUser:
      policy.lockedNotice ?? "この環境ではデータの編集がロックされています",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
