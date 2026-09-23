import type {
  FiscalPeriodDbArchiveStatus,
  FiscalPeriodDbPhase,
  FixedAssetDbStatus,
} from "@rubydogjp/openkk-server-ports";

export type FiscalPeriodDbData = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  phase: FiscalPeriodDbPhase;
  archiveStatus: FiscalPeriodDbArchiveStatus;
  archiveDataAvailable: boolean;
  archivedAt: string | null;
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
};

export type OwnedFiscalPeriodDbData = FiscalPeriodDbData & {
  userId: string;
};

export type FixedAssetDbData = {
  id: string;
  fiscalPeriodId: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: "straight_line";
  businessRate: number;
  status: FixedAssetDbStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};
