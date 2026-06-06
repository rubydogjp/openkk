export type OpenkkUserKind = "embedded" | "custom";

export type EmbeddedUser = {
  kind: "embedded";
  id: string;
  displayName: string;
};

export type CustomUser = {
  kind: "custom";
  id: string;
  displayName: string;
  email: string;
  iconUrl: string | null;
  authProvider: string;
};

export type OpenkkUser = EmbeddedUser | CustomUser;

export function isEmbeddedUser(user: OpenkkUser): user is EmbeddedUser {
  return user.kind === "embedded";
}

export function isCustomUser(user: OpenkkUser): user is CustomUser {
  return user.kind === "custom";
}

export function userCanSignOut(user: OpenkkUser): boolean {
  return user.kind === "custom";
}

export function userEmail(user: OpenkkUser): string {
  return user.kind === "custom" ? user.email : "";
}
