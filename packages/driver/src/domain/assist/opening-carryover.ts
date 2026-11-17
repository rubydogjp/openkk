import type { EntryLine } from "../entries/entry-record.js";

export type OpeningCarryoverRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  businessRate: number;
  lines: EntryLine[];
};

export type OpeningCarryoverDraft = {
  date: string;
  description: string;
  businessRateInput: string;
  businessRate: number | null;
  lines: EntryLine[];
};

export function fixedAssetsReplacedByCarryover<
  Asset extends { acquisitionDate: string },
>(assets: readonly Asset[], target: { startDate: string }): Asset[] {
  return assets.filter((asset) => asset.acquisitionDate < target.startDate);
}
