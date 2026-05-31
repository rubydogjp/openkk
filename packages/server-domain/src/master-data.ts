// マスターデータ本体 (型・デフォルト勘定科目/税区分/事業区分) は
// generated-master-data.ts に生成される。canonical な単一ソースは openkk 内の
// resources/gen/bookkeeping_master_data.json。再生成は `npm run gen-master-data`。
export * from "./generated-master-data";

export function mergeOptions(
  primary: Iterable<string>,
  secondary: Iterable<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...primary, ...secondary]) {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
