"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useOpenkkAppState } from "../shared/openkk-app-state.js";
import { useBackendApi } from "../shared/backend-api-context.js";
import {
  useOpenkkConfig,
  useOpenkkToday,
} from "../shared/openkk-config-context.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import { isSelectedFiscalPeriodDataPurged } from "../shared/archive-data-policy.js";
import { KeyedAsyncStateVersion } from "../shared/async-state-version.js";
import { KeyedAsyncMutationQueue } from "../shared/async-mutation-queue.js";
import {
  buildOpeningJournalLines,
  fixedAssetDraftToPatch,
  listFixedAssetsForPeriod,
  mapFixedAsset,
  mapOpeningJournalToRecord,
  nextOpeningCarryoverId,
  fixedAssetDraftBusinessRate,
  resolveFixedAssetAccountId,
  upsertFixedAsset,
} from "./assist-state-helpers.js";
import {
  capFixedAssetPreviewDate,
  draftBusinessRate,
  parseAmount,
  AppError,
  type BookAccount,
} from "@rubydogjp/openkk-client-domain";

import type {
  FixedAsset,
  FixedAssetDraft,
} from "@rubydogjp/openkk-client-domain";
import type { BookAccountType } from "@rubydogjp/openkk-client-domain";
import type {
  OpeningCarryoverRecord,
  OpeningCarryoverDraft,
} from "@rubydogjp/openkk-client-domain";

type AssistState = {
  listFixedAssets: (fiscalPeriodId: string) => FixedAsset[];
  getFixedAsset: (assetId: string) => FixedAsset | null;
  addFixedAsset: (draft: FixedAssetDraft) => Promise<string | null>;
  updateFixedAsset: (
    assetId: string,
    draft: FixedAssetDraft,
  ) => Promise<boolean>;
  deleteFixedAsset: (assetId: string) => Promise<boolean>;
  listOpeningCarryovers: (fiscalPeriodId: string) => OpeningCarryoverRecord[];
  getOpeningCarryover: (carryoverId: string) => OpeningCarryoverRecord | null;
  addOpeningCarryover: (
    fiscalPeriodId: string,
    draft: OpeningCarryoverDraft,
  ) => Promise<string | null>;
  updateOpeningCarryover: (
    carryoverId: string,
    draft: OpeningCarryoverDraft,
  ) => Promise<boolean>;
  deleteOpeningCarryover: (carryoverId: string) => Promise<boolean>;

  loadError: unknown;
  reload: () => void;
};

const AssistContext = createContext<AssistState | null>(null);

export function OpenkkAssistProvider(props: { children: ReactNode }) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();
  const today = useOpenkkToday();

  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);

  const [bookAccountNameById, setBookAccountNameById] = useState<
    Record<string, string>
  >({});
  const [bookAccounts, setBookAccounts] = useState<BookAccount[]>([]);
  const [bookAccountTypeById, setBookAccountTypeById] = useState<
    Record<string, BookAccountType>
  >({});
  const [taxCategories, setTaxCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [taxCategoryNameById, setTaxCategoryNameById] = useState<
    Record<string, string>
  >({});
  const [businessCategories, setBusinessCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [businessCategoryNameById, setBusinessCategoryNameById] = useState<
    Record<string, string>
  >({});
  const [masterLoadError, setMasterLoadError] = useState<unknown>(null);
  const [fixedAssetsLoadError, setFixedAssetsLoadError] =
    useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const selectedFiscalPeriodId = useRef(appState.currentFiscalPeriodId);
  const periodVersions = useRef(new KeyedAsyncStateVersion<string>());
  const assetMutationQueue = useRef(new KeyedAsyncMutationQueue<string>());
  selectedFiscalPeriodId.current = appState.currentFiscalPeriodId;
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const currentFiscalPeriodEndDate = currentFiscalPeriod?.endDate ?? null;
  const currentFiscalPeriodDataPurged = isSelectedFiscalPeriodDataPurged(
    appState.fiscalPeriods,
    appState.currentFiscalPeriodId,
  );
  const fixedAssetPreviewAsOf = useMemo(
    () => capFixedAssetPreviewDate(today, currentFiscalPeriodEndDate),
    [today, currentFiscalPeriodEndDate],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [accounts, taxCategories, businessCategories] = await Promise.all(
          [
            backendApi.masterData.getBookAccounts(),
            backendApi.masterData.getTaxCategories(),
            backendApi.masterData.getBusinessCategories(),
          ],
        );
        if (cancelled) return;
        setBookAccountNameById(
          Object.fromEntries(
            accounts.map((account) => [account.id, account.name]),
          ),
        );
        setBookAccounts(accounts);
        setBookAccountTypeById(
          Object.fromEntries(
            accounts.map((account) => [account.id, account.accountType]),
          ) as Record<string, BookAccountType>,
        );
        setTaxCategories(taxCategories);
        setTaxCategoryNameById(
          Object.fromEntries(
            taxCategories.map((category) => [category.id, category.name]),
          ),
        );
        setBusinessCategories(businessCategories);
        setBusinessCategoryNameById(
          Object.fromEntries(
            businessCategories.map((category) => [category.id, category.name]),
          ),
        );
        setMasterLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] assist master data load failed:", error);
        setMasterLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  useEffect(() => {
    const fiscalPeriodId = appState.currentFiscalPeriodId;
    if (
      fiscalPeriodId == null ||
      fiscalPeriodId.length === 0 ||
      currentFiscalPeriodDataPurged
    ) {
      setFixedAssets([]);
      setFixedAssetsLoadError(null);
      return;
    }
    let cancelled = false;
    const authOperationVersion = appState.captureAuthOperationVersion();
    const readVersion = periodVersions.current.capture(fiscalPeriodId);
    void (async () => {
      try {
        const remote = await backendApi.fixedAssets.getAll(fiscalPeriodId);
        if (
          cancelled ||
          !appState.isAuthOperationCurrent(authOperationVersion) ||
          !periodVersions.current.isCurrent(fiscalPeriodId, readVersion)
        ) {
          return;
        }
        setFixedAssets(
          remote.map((asset) =>
            mapFixedAsset(
              asset,
              bookAccountNameById[asset.bookAccountId] ?? null,
              fixedAssetPreviewAsOf,
              currentFiscalPeriodEndDate,
            ),
          ),
        );
        setFixedAssetsLoadError(null);
      } catch (error) {
        if (
          cancelled ||
          !appState.isAuthOperationCurrent(authOperationVersion) ||
          !periodVersions.current.isCurrent(fiscalPeriodId, readVersion)
        ) {
          return;
        }
        console.error("[openkk] fixed assets load failed:", error);
        setFixedAssetsLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    appState.currentFiscalPeriodId,
    bookAccountNameById,
    currentFiscalPeriodEndDate,
    currentFiscalPeriodDataPurged,
    fixedAssetPreviewAsOf,
    reloadNonce,
  ]);

  const value = useMemo<AssistState>(() => {
    const loadError = masterLoadError ?? fixedAssetsLoadError;
    return {
      listFixedAssets(fiscalPeriodId) {
        return listFixedAssetsForPeriod(fixedAssets, fiscalPeriodId);
      },
      getFixedAsset(assetId) {
        return fixedAssets.find((asset) => asset.id === assetId) ?? null;
      },
      async addFixedAsset(draft) {
        assertEditingUnlocked(config.editingPolicy, "assist.addFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null) return null;
        periodVersions.current.invalidate(fiscalPeriodId);
        const accountId = resolveFixedAssetAccountId(
          null,
          draft.account,
          bookAccounts,
        );
        if (accountId == null || accountId.length === 0) {
          throw new AppError({
            messageForDeveloper: "assist.addFixedAsset: accountId missing",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
            code: null,
          });
        }
        try {
          const created = await backendApi.fixedAssets.create(fiscalPeriodId, {
            name: draft.name,
            acquisitionDate: draft.acquisitionDate,
            acquisitionCost: parseAmount(draft.acquisitionCost),
            usefulLife: Math.max(1, Math.round(draft.usefulLife) || 1),
            depreciationMethod: "straight_line",
            businessRate: fixedAssetDraftBusinessRate(draft),
            bookAccountId: accountId,
          });
          appState.assertAuthOperationCurrent(authOperationVersion);
          if (selectedFiscalPeriodId.current === fiscalPeriodId) {
            const mapped = mapFixedAsset(
              created,
              bookAccountNameById[created.bookAccountId] ?? null,
              fixedAssetPreviewAsOf,
              currentFiscalPeriodEndDate ?? null,
            );
            setFixedAssets((current) => upsertFixedAsset(current, mapped));
          }
          return created.id;
        } finally {
          periodVersions.current.invalidate(fiscalPeriodId);
        }
      },
      async updateFixedAsset(assetId, draft) {
        assertEditingUnlocked(config.editingPolicy, "assist.updateFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const current =
          fixedAssets.find((asset) => asset.id === assetId) ?? null;
        const fiscalPeriodId =
          current?.fiscalPeriodId ?? appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null) return false;
        const accountId = resolveFixedAssetAccountId(
          current == null
            ? null
            : {
                accountId: current.bookAccountId,
                accountName: current.accountName,
              },
          draft.account,
          bookAccounts,
        );
        if (accountId == null || accountId.length === 0) {
          throw new AppError({
            messageForDeveloper: "assist.updateFixedAsset: accountId missing",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
            code: null,
          });
        }
        return await assetMutationQueue.current.run(assetId, async () => {
          appState.assertAuthOperationCurrent(authOperationVersion);
          periodVersions.current.invalidate(fiscalPeriodId);
          try {
            const patched = await backendApi.fixedAssets.patch(
              fiscalPeriodId,
              assetId,
              fixedAssetDraftToPatch(draft, accountId),
            );
            appState.assertAuthOperationCurrent(authOperationVersion);
            if (selectedFiscalPeriodId.current === fiscalPeriodId) {
              const mapped = mapFixedAsset(
                patched,
                bookAccountNameById[patched.bookAccountId] ?? null,
                fixedAssetPreviewAsOf,
                currentFiscalPeriodEndDate ?? null,
              );
              setFixedAssets((currentList) =>
                upsertFixedAsset(currentList, mapped),
              );
            }
            return true;
          } finally {
            periodVersions.current.invalidate(fiscalPeriodId);
          }
        });
      },
      listOpeningCarryovers(fiscalPeriodId) {
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        const journals = period?.opening.openingJournals ?? [];
        return journals
          .map((journal) =>
            mapOpeningJournalToRecord(
              journal,
              fiscalPeriodId,
              bookAccountNameById,
              bookAccountTypeById,
              taxCategoryNameById,
              businessCategoryNameById,
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
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        const journals = period?.opening.openingJournals ?? [];
        const journal = journals.find((item) => item.id === carryoverId);
        if (journal == null) return null;
        return mapOpeningJournalToRecord(
          journal,
          fiscalPeriodId,
          bookAccountNameById,
          bookAccountTypeById,
          taxCategoryNameById,
          businessCategoryNameById,
        );
      },
      async addOpeningCarryover(fiscalPeriodId, draft) {
        assertEditingUnlocked(config.editingPolicy, "assist.addOpeningCarryover");
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        if (period == null) return null;
        let nextId: string | null = null;
        const updated = await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            const generatedId = nextOpeningCarryoverId(
              fiscalPeriodId,
              currentOpening.openingJournals,
            );
            nextId = generatedId;
            const lines = buildOpeningJournalLines(generatedId, draft, {
              accounts: bookAccounts,
              taxCategories,
              businessCategories,
            });
            if (lines == null) {
              throw openingCarryoverAccountResolutionError(
                "assist.addOpeningCarryover",
              );
            }
            const newJournal = {
              id: generatedId,
              date: draft.date,
              description: draft.description,
              businessRate: draftBusinessRate(draft),
              lines,
            };
            return {
              opening: {
                ...currentOpening,
                openingJournals: [
                  ...currentOpening.openingJournals,
                  newJournal,
                ],
              },
            };
          },
        );
        return updated ? nextId : null;
      },
      async updateOpeningCarryover(carryoverId, draft) {
        assertEditingUnlocked(config.editingPolicy, "assist.updateOpeningCarryover");
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        if (period == null) return false;
        return await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            const journals = currentOpening.openingJournals;
            const target = journals.find(
              (journal) => journal.id === carryoverId,
            );
            if (target == null) return null;
            const lines = buildOpeningJournalLines(target.id, draft, {
              accounts: bookAccounts,
              taxCategories,
              businessCategories,
            });
            if (lines == null) {
              throw openingCarryoverAccountResolutionError(
                "assist.updateOpeningCarryover",
              );
            }
            const nextJournal = {
              ...target,
              date: draft.date,
              description: draft.description,
              businessRate: draftBusinessRate(draft),
              lines,
            };
            return {
              opening: {
                ...currentOpening,
                openingJournals: journals.map((journal) =>
                  journal.id === carryoverId ? nextJournal : journal,
                ),
              },
            };
          },
        );
      },
      async deleteFixedAsset(assetId) {
        assertEditingUnlocked(config.editingPolicy, "assist.deleteFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const current =
          fixedAssets.find((asset) => asset.id === assetId) ?? null;
        const fiscalPeriodId =
          current?.fiscalPeriodId ?? appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null) return false;
        return await assetMutationQueue.current.run(assetId, async () => {
          appState.assertAuthOperationCurrent(authOperationVersion);
          periodVersions.current.invalidate(fiscalPeriodId);
          try {
            await backendApi.fixedAssets.remove(fiscalPeriodId, assetId);
            appState.assertAuthOperationCurrent(authOperationVersion);
            if (selectedFiscalPeriodId.current === fiscalPeriodId) {
              setFixedAssets((currentList) =>
                currentList.filter((asset) => asset.id !== assetId),
              );
            }
            return true;
          } finally {
            periodVersions.current.invalidate(fiscalPeriodId);
          }
        });
      },
      async deleteOpeningCarryover(carryoverId) {
        assertEditingUnlocked(config.editingPolicy, "assist.deleteOpeningCarryover");
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        if (period == null) return false;
        return await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            const journals = currentOpening.openingJournals;
            const nextJournals = journals.filter(
              (journal) => journal.id !== carryoverId,
            );
            if (nextJournals.length === journals.length) return null;
            return {
              opening: {
                ...currentOpening,
                openingJournals: nextJournals,
              },
            };
          },
        );
      },
      loadError,
      reload() {
        setReloadNonce((nonce) => nonce + 1);
      },
    };
  }, [
    appState.currentFiscalPeriodId,
    appState.fiscalPeriods,
    bookAccounts,
    bookAccountNameById,
    bookAccountTypeById,
    businessCategories,
    businessCategoryNameById,
    currentFiscalPeriodEndDate,
    fixedAssetPreviewAsOf,
    fixedAssets,
    fixedAssetsLoadError,
    masterLoadError,
    taxCategories,
    taxCategoryNameById,
  ]);

  return (
    <AssistContext.Provider value={value}>
      {props.children}
    </AssistContext.Provider>
  );
}

function openingCarryoverAccountResolutionError(operation: string): AppError {
  return new AppError({
    messageForDeveloper: `${operation}: account resolution failed`,
    messageForUser: "勘定科目が解決できないため保存できませんでした",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

export { fixedAssetDraftToPatch, nextOpeningCarryoverId };

export function useOpenkkAssist() {
  const value = useContext(AssistContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkAssist must be used within OpenkkAssistProvider",
      messageForUser: "補助データを読み込めませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return value;
}
