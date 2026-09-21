export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowMs(): number {
  return Date.now();
}
