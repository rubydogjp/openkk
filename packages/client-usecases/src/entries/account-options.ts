import type {
  MasterBookAccount,
  MasterBookAccountBalanceSheetSection,
} from "@rubydogjp/openkk-client-ports";
import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";

export type EntryMasterAccountOption = {
  id: string;
  name: string;
  selectionLabel: string;
  accountType: EntryAccountVisualType;
  balanceSheetSection: MasterBookAccountBalanceSheetSection;
};

const BALANCE_SHEET_SECTION_LABELS: Record<
  MasterBookAccountBalanceSheetSection,
  string
> = {
  current_asset: "流動資産",
  fixed_asset: "固定資産",
  deferred_asset: "繰延資産",
  current_liability: "流動負債",
  long_term_liability: "固定負債",
  equity: "純資産",
  none: "",
};

export function buildEntryMasterAccountOptions(
  accounts: ReadonlyArray<MasterBookAccount>,
): EntryMasterAccountOption[] {
  const groupedAccounts = new Map<string, MasterBookAccount[]>();
  for (const account of accounts) {
    const key = `${account.accountType}:${account.name}`;
    const group = groupedAccounts.get(key) ?? [];
    group.push(account);
    groupedAccounts.set(key, group);
  }
  return accounts.map((account) => {
    const key = `${account.accountType}:${account.name}`;
    const group = groupedAccounts.get(key) ?? [];
    return {
      id: account.id,
      name: account.name,
      selectionLabel: `${account.name}${accountDisambiguation(account, group)}`,
      accountType: account.accountType,
      balanceSheetSection: account.balanceSheetSection,
    };
  });
}

function accountDisambiguation(
  account: MasterBookAccount,
  group: ReadonlyArray<MasterBookAccount>,
): string {
  if (group.length <= 1) return "";
  const sectionLabel = BALANCE_SHEET_SECTION_LABELS[account.balanceSheetSection];
  const sameSectionCount = group.filter(
    (candidate) =>
      candidate.balanceSheetSection === account.balanceSheetSection,
  ).length;
  if (sectionLabel !== "" && sameSectionCount === 1) {
    return `（${sectionLabel}）`;
  }
  const identifier =
    sectionLabel === "" ? account.id : `${sectionLabel}・${account.id}`;
  return `（${identifier}）`;
}
