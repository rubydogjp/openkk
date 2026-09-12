import {
  AppError,
  resolveEditingPolicy,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client-domain";

export function assertEditingUnlocked(
  config: Pick<OpenkkConfig, "editingPolicy">,
  operation: string,
): void {
  const policy = resolveEditingPolicy(config);
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
