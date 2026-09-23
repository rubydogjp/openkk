import type { MasterBookAccountType } from "./generated-master-data.js";

export type FiscalPeriodPhase =
  | "pre_opening"
  | "journalizing"
  | "pre_closing"
  | "post_closing";

export type FiscalPeriodArchiveStatus = "active" | "archived" | "purged";

export type EntrySide = "debit" | "credit";

export type EntryLine = {
  side: EntrySide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type Entry = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLine[];
};

export type EntryLineRecord = {
  id: string;
  side: EntrySide;
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryRecord = {
  id: string;
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineRecord[];
};

export type OpeningBalanceLine = {
  id: string;
  accountId: string;
  amount: number;
};

export type OpeningJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: EntryLineRecord[];
};

export type Opening = {
  openingBalanceLines: OpeningBalanceLine[];
  openingJournals: OpeningJournal[];
};

export type FixedAssetStatus = "active" | "sold" | "disposed" | "retired";

export type FixedAsset = {
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

export type FixedAssetRecord = {
  id: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

export type BookAccount = {
  id: string;
  accountType: MasterBookAccountType;
};
