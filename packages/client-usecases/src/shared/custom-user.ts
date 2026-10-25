import type { CustomUser } from "@rubydogjp/openkk-client-domain";

export function buildCustomUser(input: {
  id: string;
  displayName: string | null;
  email: string | null;
  iconUrl: string | null;
  authProvider: string | null;
}): CustomUser {
  return {
    kind: "custom",
    id: input.id,
    displayName: nonBlankOrNull(input.displayName) ?? input.id,
    email: nonBlankOrNull(input.email)?.trim() ?? null,
    iconUrl: input.iconUrl,
    authProvider: nonBlankOrNull(input.authProvider) ?? "custom",
  };
}

function nonBlankOrNull(value: string | null): string | null {
  return value == null || value.trim() === "" ? null : value;
}
