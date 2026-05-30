"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOpenkkAppState } from "../shared/openkk-app-state";
import { useBackendApi } from "../shared/backend-api-context";
import { parseAmount, AppError } from "@rubydogjp/openkk-client-domain";
import type { FixedAssetFrozenPreview } from "@rubydogjp/openkk-client-ports";

import type {
  FixedAssetDraft,
  FixedAssetPreviewItem,
} from "@rubydogjp/openkk-client-domain";
import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";
import type {
  OpeningCarryoverRecord,
  OpeningCarryoverDraft,
} from "@rubydogjp/openkk-client-domain";

type AssistState = {
  listFixedAssets: () => FixedAssetPreviewItem[];
  getFixedAsset: (assetId: string) => FixedAssetPreviewItem | null;
  addFixedAsset: () => Promise<string | null>;
  updateFixedAsset: (assetId: string, draft: FixedAssetDraft) => Promise<boolean>;
  listOpeningCarryovers: (fiscalPeriodId: string) => OpeningCarryoverRecord[];
  getOpeningCarryover: (carryoverId: string) => OpeningCarryoverRecord | null;
  addOpeningCarryover: (fiscalPeriodId: string) => Promise<string | null>;
  updateOpeningCarryover: (
    carryoverId: string,
    draft: OpeningCarryoverDraft,
  ) => Promise<boolean>;
  deleteOpeningCarryover: (carryoverId: string) => Promise<boolean>;
};

const AssistContext = createContext<AssistState | null>(null);

export function OpenkkAssistProvider(props: { children: ReactNode }) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();

  const [fixedAssets, setFixedAssets] = useState<FixedAssetPreviewItem[]>([]);

  const [bookAccountNameById, setBookAccountNameById] = useState<Record<string, string>>(
    {},
  );
  const [bookAccountIdByName, setBookAccountIdByName] = useState<Record<string, string>>(
    {},
  );
  const [bookAccountTypeById, setBookAccountTypeById] = useState<
    Record<string, EntryAccountVisualType>
  >({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accounts = await backendApi.masterData.getBookAccounts();
        if (cancelled) return;
        setBookAccountNameById(
          Object.fromEntries(accounts.map((account) => [account.id, account.name])),
        );
        setBookAccountIdByName(
          Object.fromEntries(accounts.map((account) => [account.name, account.id])),
        );
        setBookAccountTypeById(
          Object.fromEntries(
            accounts.map((account) => [account.id, account.accountType]),
          ) as Record<string, EntryAccountVisualType>,
        );
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fiscalPeriodId = appState.currentFiscalPeriodId;
    if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const remote = await backendApi.fixedAssets.getAll(fiscalPeriodId);
        if (cancelled) return;
        setFixedAssets(
          remote.map((asset) =>
            mapFixedAssetToPreview(asset, bookAccountNameById[asset.bookAccountId]),
          ),
        );
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appState.currentFiscalPeriodId, bookAccountNameById]);

  const value = useMemo<AssistState>(() => {
    return {
      listFixedAssets() {
        return fixedAssets;
      },
      getFixedAsset(assetId) {
        return fixedAssets.find((asset) => asset.id === assetId) ?? null;
      },
      async addFixedAsset() {
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
          return null;
        }
        const currentFiscalPeriod = appState.fiscalPeriods.find(
          (period) => period.id === fiscalPeriodId,
        );
        const acquisitionYear =
          currentFiscalPeriod?.startDate.slice(0, 4) || "2026";
        const defaultAccountId =
          bookAccountIdByName["工具器具備品"] ??
          Object.values(bookAccountIdByName)[0] ??
          "";
        if (defaultAccountId === "") {
          throw new AppError({
            messageForDeveloper: "assist.addFixedAsset: no default book account",
            messageForUser: "勘定科目が取得できないため固定資産を作成できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        const created = await backendApi.fixedAssets.create(fiscalPeriodId, {
          name: "新しい固定資産",
          acquisitionDate: `${acquisitionYear}-01-01`,
          acquisitionCost: 50000,
          usefulLife: 3,
          depreciationMethod: "straight_line",
          businessRate: 1,
          bookAccountId: defaultAccountId,
        });
        setFixedAssets((current) => [
          ...current,
          mapFixedAssetToPreview(created, bookAccountNameById[created.bookAccountId]),
        ]);
        return created.id;
      },
      async updateFixedAsset(assetId, draft) {
        const current = fixedAssets.find((asset) => asset.id === assetId) ?? null;
        const fiscalPeriodId =
          current?.fiscalPeriodId ?? appState.currentFiscalPeriodId ?? "";
        if (fiscalPeriodId.length === 0) return false;
        const accountId =
          current?.accountId ??
          bookAccountIdByName[draft.account] ??
          null;
        if (accountId == null || accountId.length === 0) {
          throw new AppError({
            messageForDeveloper: "assist.updateFixedAsset: accountId missing",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        const patched = await backendApi.fixedAssets.patch(fiscalPeriodId, assetId, {
          name: draft.name,
          businessRate: Number(draft.progress) || 0,
          status: mapFixedAssetStatusApi(draft.status),
          bookAccountId: accountId,
        });
        setFixedAssets((currentList) =>
          currentList.map((asset) =>
            asset.id === assetId
              ? mapFixedAssetToPreview(
                  patched,
                  bookAccountNameById[patched.bookAccountId],
                )
              : asset,
          ),
        );
        return true;
      },
      listOpeningCarryovers(fiscalPeriodId) {
        const period = appState.fiscalPeriods.find((p) => p.id === fiscalPeriodId);
        const journals = period?.opening?.carryoverJournals ?? [];
        return journals
          .map((journal) =>
            mapOpeningJournalToRecord(
              journal,
              fiscalPeriodId,
              bookAccountNameById,
              bookAccountTypeById,
            ),
          )
          .sort((left, right) => {
            const byDate = left.date.localeCompare(right.date);
            if (byDate !== 0) return byDate;
            return left.id.localeCompare(right.id);
          });
      },
      getOpeningCarryover(carryoverId) {
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return null;
        const period = appState.fiscalPeriods.find((p) => p.id === fiscalPeriodId);
        const journals = period?.opening?.carryoverJournals ?? [];
        const journal = journals.find((item) => item.id === carryoverId);
        if (journal == null) return null;
        return mapOpeningJournalToRecord(
          journal,
          fiscalPeriodId,
          bookAccountNameById,
          bookAccountTypeById,
        );
      },
      async addOpeningCarryover(fiscalPeriodId) {
        const period = appState.fiscalPeriods.find((p) => p.id === fiscalPeriodId);
        const opening = period?.opening;
        if (period == null || opening == null) return null;
        const debitAccountId =
          bookAccountIdByName["売掛金"] ?? Object.values(bookAccountIdByName)[0] ?? "";
        const creditAccountId =
          bookAccountIdByName["売上"] ?? Object.values(bookAccountIdByName)[0] ?? "";
        if (debitAccountId === "" || creditAccountId === "") {
          throw new AppError({
            messageForDeveloper: "assist.addOpeningCarryover: account resolution failed",
            messageForUser: "勘定科目が取得できないため再振替仕訳を作成できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        const nextId = `oc-${fiscalPeriodId}-${(opening.carryoverJournals?.length ?? 0) + 1}`;
        const newJournal = {
          id: nextId,
          date: period.startDate,
          description: "期首再振替",
          businessRate: 1,
          lines: [
            {
              id: `${nextId}-d`,
              side: "debit" as const,
              bookAccountId: debitAccountId,
              amount: 0,
              partnerName: "",
              taxCategoryName: "",
              businessCategoryName: "",
            },
            {
              id: `${nextId}-c`,
              side: "credit" as const,
              bookAccountId: creditAccountId,
              amount: 0,
              partnerName: "",
              taxCategoryName: "",
              businessCategoryName: "",
            },
          ],
        };
        const updatedJournals = [...(opening.carryoverJournals ?? []), newJournal];
        await appState.updateFiscalPeriod(fiscalPeriodId, {
          opening: {
            ...opening,
            carryoverJournals: updatedJournals,
          },
        });
        return nextId;
      },
      async updateOpeningCarryover(carryoverId, draft) {
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find((p) => p.id === fiscalPeriodId);
        const opening = period?.opening;
        if (period == null || opening == null) return false;
        const debitAccountId =
          resolveBookAccountIdByName(draft.debit, bookAccountIdByName) ?? "";
        const creditAccountId =
          resolveBookAccountIdByName(draft.credit, bookAccountIdByName) ?? "";
        if (debitAccountId === "" || creditAccountId === "") {
          throw new AppError({
            messageForDeveloper:
              "assist.updateOpeningCarryover: account resolution failed",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        const journals = opening.carryoverJournals ?? [];
        let updated = false;
        const nextJournals = journals.map((journal) => {
          if (journal.id !== carryoverId) return journal;
          updated = true;
          return {
            ...journal,
            date: draft.date,
            description: draft.description,
            businessRate: Math.max(0, Number(draft.businessRate) || 0) / 100,
            lines: [
              {
                id: journal.lines.find((line) => line.side === "debit")?.id ?? `${journal.id}-d`,
                side: "debit" as const,
                bookAccountId: debitAccountId,
                amount: parseAmount(draft.debitAmount),
                partnerName: draft.partner,
                taxCategoryName: draft.taxCategory,
                businessCategoryName: draft.businessCategory,
              },
              {
                id: journal.lines.find((line) => line.side === "credit")?.id ?? `${journal.id}-c`,
                side: "credit" as const,
                bookAccountId: creditAccountId,
                amount: parseAmount(draft.creditAmount),
                partnerName: draft.partner,
                taxCategoryName: draft.taxCategory,
                businessCategoryName: draft.businessCategory,
              },
            ],
          };
        });
        if (!updated) return false;
        await appState.updateFiscalPeriod(fiscalPeriodId, {
          opening: {
            ...opening,
            carryoverJournals: nextJournals,
          },
        });
        return true;
      },
      async deleteOpeningCarryover(carryoverId) {
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find((p) => p.id === fiscalPeriodId);
        const opening = period?.opening;
        if (period == null || opening == null) return false;
        const journals = opening.carryoverJournals ?? [];
        const nextJournals = journals.filter((journal) => journal.id !== carryoverId);
        if (nextJournals.length === journals.length) return false;
        await appState.updateFiscalPeriod(fiscalPeriodId, {
          opening: {
            ...opening,
            carryoverJournals: nextJournals,
          },
        });
        return true;
      },
    };
  }, [
    appState.currentFiscalPeriodId,
    appState.fiscalPeriods,
    bookAccountIdByName,
    bookAccountNameById,
    bookAccountTypeById,
    fixedAssets,
  ]);

  return (
    <AssistContext.Provider value={value}>
      {props.children}
    </AssistContext.Provider>
  );
}

function mapOpeningJournalToRecord(
  journal: {
    id: string;
    date: string;
    description: string;
    businessRate: number;
    lines: Array<{
      side: "debit" | "credit";
      bookAccountId: string;
      amount: number;
      partnerName: string;
      taxCategoryName: string;
      businessCategoryName: string;
    }>;
  },
  fiscalPeriodId: string,
  accountNameById: Record<string, string>,
  accountTypeById: Record<string, EntryAccountVisualType>,
): OpeningCarryoverRecord {
  const debit = journal.lines.find((line) => line.side === "debit");
  const credit = journal.lines.find((line) => line.side === "credit");
  return {
    id: journal.id,
    fiscalPeriodId,
    date: journal.date,
    description: journal.description,
    debit: accountNameById[debit?.bookAccountId ?? ""] ?? debit?.bookAccountId ?? "",
    debitType: accountTypeById[debit?.bookAccountId ?? ""] ?? "asset",
    debitAmount: formatAmount(debit?.amount ?? 0),
    credit: accountNameById[credit?.bookAccountId ?? ""] ?? credit?.bookAccountId ?? "",
    creditType: accountTypeById[credit?.bookAccountId ?? ""] ?? "revenue",
    creditAmount: formatAmount(credit?.amount ?? 0),
    partner: debit?.partnerName ?? credit?.partnerName ?? "",
    taxCategory: debit?.taxCategoryName ?? credit?.taxCategoryName ?? "対象外",
    businessCategory:
      debit?.businessCategoryName ?? credit?.businessCategoryName ?? "対象外",
    businessRate: String(Math.round((journal.businessRate ?? 1) * 100)),
    debitBookAccountId: debit?.bookAccountId,
    creditBookAccountId: credit?.bookAccountId,
  };
}

function resolveBookAccountIdByName(
  name: string,
  accountIdByName: Record<string, string>,
): string | null {
  const id = accountIdByName[name];
  return id == null || id.length === 0 ? null : id;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.abs(value));
}

function mapFixedAssetToPreview(
  asset: {
    id: string;
    fiscalPeriodId: string;
    name: string;
    bookAccountId: string;
    acquisitionDate: string;
    acquisitionCost: number;
    usefulLife: number;
    businessRate: number;
    status: string;
    disposalDate?: string;
    disposalPrice?: number;
    frozenPreview?: FixedAssetFrozenPreview;
  },
  accountName?: string,
): FixedAssetPreviewItem {
  const frozenPreview = asset.frozenPreview;
  const dynamicPreview = buildDynamicFixedAssetPreview(asset);
  return {
    id: asset.id,
    fiscalPeriodId: asset.fiscalPeriodId,
    name: asset.name,
    account: accountName ?? asset.bookAccountId,
    accountId: asset.bookAccountId,
    period: frozenPreview?.period ?? dynamicPreview.period,
    remaining: frozenPreview?.remaining ?? dynamicPreview.remaining,
    progress:
      normalizeFixedAssetProgress(frozenPreview?.progress) ?? dynamicPreview.progress,
    current:
      formatFixedAssetPreviewAmount(frozenPreview?.current) ??
      dynamicPreview.current,
    purchase:
      formatFixedAssetPreviewAmount(frozenPreview?.purchase) ??
      dynamicPreview.purchase,
    status: frozenPreview?.status ?? mapFixedAssetStatusLabel(asset.status),
    acquisitionDate: asset.acquisitionDate,
    usefulLife: asset.usefulLife,
    businessRate: asset.businessRate,
    disposalDate: asset.disposalDate,
    disposalPrice:
      asset.disposalPrice == null
        ? undefined
        : new Intl.NumberFormat("ja-JP").format(asset.disposalPrice),
  };
}

function buildDynamicFixedAssetPreview(asset: {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
}): Pick<
  FixedAssetPreviewItem,
  "period" | "remaining" | "progress" | "current" | "purchase"
> {
  const today = new Date();
  const startYear = Number(asset.acquisitionDate.slice(0, 4));
  const startMonth = Number(asset.acquisitionDate.slice(5, 7));
  const startDay = Number(asset.acquisitionDate.slice(8, 10));
  const totalMonths = Math.min(1200, Math.max(1, asset.usefulLife * 12));
  const rawElapsedMonths =
    (today.getFullYear() - startYear) * 12 +
    (today.getMonth() + 1 - startMonth) -
    (today.getDate() < startDay ? 1 : 0);
  const elapsedMonths = Math.max(0, rawElapsedMonths);
  const remainingMonths = Math.max(0, Math.min(totalMonths, totalMonths - elapsedMonths));
  const progress = Math.min(1, elapsedMonths / totalMonths);
  const currentBookValue = Math.max(
    0,
    Math.round(asset.acquisitionCost * (1 - progress)),
  );
  const remainingText = remainingMonths > 0 ? `あと${remainingMonths}ヶ月` : "償却済み";
  return {
    period: `${asset.acquisitionDate.slice(0, 4)}年${Number(asset.acquisitionDate.slice(5, 7))}月〜`,
    remaining: remainingText,
    progress,
    current: new Intl.NumberFormat("ja-JP").format(currentBookValue),
    purchase: new Intl.NumberFormat("ja-JP").format(asset.acquisitionCost),
  };
}

function normalizeFixedAssetProgress(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}

function formatFixedAssetPreviewAmount(value: string | number | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat("ja-JP").format(value);
}

function mapFixedAssetStatusLabel(status: string): string {
  if (status === "active") return "償却中";
  if (status === "sold") return "売却済";
  if (status === "disposed") return "廃棄済";
  if (status === "retired") return "完了";
  return status;
}

function mapFixedAssetStatusApi(
  statusLabel: string,
): "active" | "sold" | "disposed" | "retired" {
  if (statusLabel === "償却中") return "active";
  if (statusLabel === "売却済") return "sold";
  if (statusLabel === "廃棄済") return "disposed";
  if (statusLabel === "完了") return "retired";
  return "active";
}

export function useOpenkkAssist() {
  const value = useContext(AssistContext);
  if (value == null) {
    throw new Error(
      "useOpenkkAssist must be used within OpenkkAssistProvider",
    );
  }
  return value;
}
