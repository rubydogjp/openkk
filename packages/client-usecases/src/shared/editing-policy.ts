import {
  AppError,
  type EditingPolicy,
} from "@rubydogjp/openkk-client-domain";

export function assertEditingUnlocked(
  editingPolicy: EditingPolicy,
  operation: string,
): void {
  if (!editingPolicy.locked) return;

  throw new AppError({
    messageForDeveloper: `${operation}: editing is locked by configuration`,
    messageForUser: editingPolicy.lockedNotice,
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
