export type PersistentStorage = Pick<StorageManager, "persist" | "persisted">;

export type PersistentStorageOutcome =
  "already_persisted" | "granted" | "denied" | "unsupported" | "failed";

function isPersistentStorage(value: unknown): value is PersistentStorage {
  return (
    typeof value === "object" &&
    value != null &&
    "persist" in value &&
    typeof value.persist === "function" &&
    "persisted" in value &&
    typeof value.persisted === "function"
  );
}

export function browserPersistentStorage(): PersistentStorage | null {
  const storage: unknown =
    typeof navigator === "object" ? navigator.storage : null;
  return isPersistentStorage(storage) ? storage : null;
}

export async function requestPersistentStorage(
  storage: PersistentStorage | null,
): Promise<PersistentStorageOutcome> {
  if (storage == null) return "unsupported";
  try {
    if (await storage.persisted()) return "already_persisted";
    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "failed";
  }
}
