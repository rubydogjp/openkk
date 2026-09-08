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
import { useOpenkkConfig } from "../shared/openkk-config-context.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import { isSelectedFiscalPeriodDataPurged } from "../shared/archive-data-policy.js";
import { AsyncStateVersion } from "../shared/async-state-version.js";
import { KeyedAsyncMutationQueue } from "../shared/async-mutation-queue.js";
import {
  buildCategoryIdByValue,
  buildOpeningJournalLines,
  fixedAssetDraftToPatch,
  groupAccountIdsByName,
  listFixedAssetsForPeriod,
  mapFixedAssetToPreview,
  mapOpeningJournalToRecord,
  nextOpeningCarryoverId,
  openingDraftBusinessRate,
  replaceLoadedFixedAssets,
  resolveBookAccountId,
  resolveFixedAssetDraftBusinessRate,
  resolveUpdatedBookAccountId,
  upsertFixedAsset,
} from "./assist-state-helpers.js";
import {
  capFixedAssetPreviewDate,
  parseAmount,
  AppError,
} from "@rubydogjp/openkk-client-domain";

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
  listFixedAssets: (fiscalPeriodId: string | null) => FixedAssetPreviewItem[];
  getFixedAsset: (assetId: string) => FixedAssetPreviewItem | null;
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

  const [fixedAssets, setFixedAssets] = useState<FixedAssetPreviewItem[]>([]);

  const [bookAccountNameById, setBookAccountNameById] = useState<
    Record<string, string>
  >({});
  const [bookAccountIdsByName, setBookAccountIdsByName] = useState<
    Record<string, string[]>
  >({});
  const [bookAccountTypeById, setBookAccountTypeById] = useState<
    Record<string, EntryAccountVisualType>
  >({});
  const [taxCategoryIdByValue, setTaxCategoryIdByValue] = useState<
    Record<string, string>
  >({});
  const [taxCategoryNameById, setTaxCategoryNameById] = useState<
    Record<string, string>
  >({});
  const [businessCategoryIdByValue, setBusinessCategoryIdByValue] = useState<
    Record<string, string>
  >({});
  const [businessCategoryNameById, setBusinessCategoryNameById] = useState<
    Record<string, string>
  >({});
  const [masterLoadError, setMasterLoadError] = useState<unknown>(null);
  const [fixedAssetsLoadError, setFixedAssetsLoadError] =
    useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const selectedFiscalPeriodId = useRef(appState.currentFiscalPeriodId);
  const periodVersions = useRef(new AsyncStateVersion<string>());
  const assetMutationQueue = useRef(new KeyedAsyncMutationQueue<string>());
  selectedFiscalPeriodId.current = appState.currentFiscalPeriodId;
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const currentFiscalPeriodEndDate = currentFiscalPeriod?.endDate;
  const currentFiscalPeriodDataPurged = isSelectedFiscalPeriodDataPurged(
    appState.fiscalPeriods,
    appState.currentFiscalPeriodId,
  );
  const fixedAssetPreviewAsOf = useMemo(
    () =>
      capFixedAssetPreviewDate(config.today, currentFiscalPeriodEndDate),
    [config.today, currentFiscalPeriodEndDate],
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
        setBookAccountIdsByName(groupAccountIdsByName(accounts));
        setBookAccountTypeById(
          Object.fromEntries(
            accounts.map((account) => [account.id, account.accountType]),
          ) as Record<string, EntryAccountVisualType>,
        );
        setTaxCategoryIdByValue(buildCategoryIdByValue(taxCategories));
        setTaxCategoryNameById(
          Object.fromEntries(
            taxCategories.map((category) => [category.id, category.name]),
          ),
        );
        setBusinessCategoryIdByValue(
          buildCategoryIdByValue(businessCategories),
        );
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
          replaceLoadedFixedAssets(
            fiscalPeriodId,
            remote.map((asset) =>
              mapFixedAssetToPreview(
                asset,
                bookAccountNameById[asset.bookAccountId] ?? null,
                fixedAssetPreviewAsOf,
                currentFiscalPeriodEndDate ?? null,
              ),
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
        assertEditingUnlocked(config, "assist.addFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
          return null;
        }
        periodVersions.current.invalidate(fiscalPeriodId);
        const accountId = resolveBookAccountId(
          null,
          draft.account,
          "asset",
          {
            accountIdsByName: bookAccountIdsByName,
            accountTypeById: bookAccountTypeById,
          },
        );
        if (accountId == null || accountId.length === 0) {
          throw new AppError({
            messageForDeveloper: "assist.addFixedAsset: accountId missing",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        try {
          const created = await backendApi.fixedAssets.create(fiscalPeriodId, {
            name: draft.name,
            acquisitionDate: draft.acquisitionDate,
            acquisitionCost: parseAmount(draft.acquisitionCost),
            usefulLife: Math.max(1, Math.round(draft.usefulLife) || 1),
            depreciationMethod: "straight_line",
            businessRate: resolveFixedAssetDraftBusinessRate(draft),
            bookAccountId: accountId,
          });
          appState.assertAuthOperationCurrent(authOperationVersion);
          if (selectedFiscalPeriodId.current === fiscalPeriodId) {
            const mapped = mapFixedAssetToPreview(
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
        assertEditingUnlocked(config, "assist.updateFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const current =
          fixedAssets.find((asset) => asset.id === assetId) ?? null;
        const fiscalPeriodId =
          current?.fiscalPeriodId ?? appState.currentFiscalPeriodId ?? "";
        if (fiscalPeriodId.length === 0) return false;
        const accountId = resolveUpdatedBookAccountId(
          current == null
            ? null
            : { accountId: current.accountId, accountName: current.account },
          draft.account,
          "asset",
          {
            accountIdsByName: bookAccountIdsByName,
            accountTypeById: bookAccountTypeById,
          },
        );
        if (accountId == null || accountId.length === 0) {
          throw new AppError({
            messageForDeveloper: "assist.updateFixedAsset: accountId missing",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
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
              const mapped = mapFixedAssetToPreview(
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
        const journals = period?.opening?.openingJournals ?? [];
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
        const journals = period?.opening?.openingJournals ?? [];
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
        assertEditingUnlocked(config, "assist.addOpeningCarryover");
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        const opening = period?.opening;
        if (period == null || opening == null) return null;
        let nextId: string | null = null;
        const updated = await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            if (currentOpening == null) return null;
            const generatedId = nextOpeningCarryoverId(
              fiscalPeriodId,
              currentOpening.openingJournals ?? [],
            );
            nextId = generatedId;
            const lines = buildOpeningJournalLines(generatedId, draft, {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
              taxCategoryIdByValue,
              businessCategoryIdByValue,
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
              businessRate: openingDraftBusinessRate(draft),
              lines,
            };
            return {
              opening: {
                ...currentOpening,
                openingJournals: [
                  ...(currentOpening.openingJournals ?? []),
                  newJournal,
                ],
              },
            };
          },
        );
        return updated ? nextId : null;
      },
      async updateOpeningCarryover(carryoverId, draft) {
        assertEditingUnlocked(config, "assist.updateOpeningCarryover");
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        const opening = period?.opening;
        if (period == null || opening == null) return false;
        return await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            if (currentOpening == null) return null;
            const journals = currentOpening.openingJournals ?? [];
            const target = journals.find(
              (journal) => journal.id === carryoverId,
            );
            if (target == null) return null;
            const lines = buildOpeningJournalLines(target.id, draft, {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
              taxCategoryIdByValue,
              businessCategoryIdByValue,
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
              businessRate: openingDraftBusinessRate(draft),
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
        assertEditingUnlocked(config, "assist.deleteFixedAsset");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const current =
          fixedAssets.find((asset) => asset.id === assetId) ?? null;
        const fiscalPeriodId =
          current?.fiscalPeriodId ?? appState.currentFiscalPeriodId ?? "";
        if (fiscalPeriodId.length === 0) return false;
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
        assertEditingUnlocked(config, "assist.deleteOpeningCarryover");
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return false;
        const period = appState.fiscalPeriods.find(
          (p) => p.id === fiscalPeriodId,
        );
        const opening = period?.opening;
        if (period == null || opening == null) return false;
        return await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            if (currentOpening == null) return null;
            const journals = currentOpening.openingJournals ?? [];
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
    bookAccountIdsByName,
    bookAccountNameById,
    bookAccountTypeById,
    businessCategoryIdByValue,
    businessCategoryNameById,
    currentFiscalPeriodEndDate,
    fixedAssetPreviewAsOf,
    fixedAssets,
    fixedAssetsLoadError,
    masterLoadError,
    taxCategoryIdByValue,
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
  });
}

export {
  fixedAssetDraftToPatch,
  nextOpeningCarryoverId,
  replaceLoadedFixedAssets,
};

export function useOpenkkAssist() {
  const value = useContext(AssistContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkAssist must be used within OpenkkAssistProvider",
      messageForUser: "補助データを読み込めませんでした",
      originalMessage: null,
      statusCode: null,
    });
  }
  return value;
}
