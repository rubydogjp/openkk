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
import {
  buildCategoryIdByValue,
  fixedAssetDraftToPatch,
  groupAccountIdsByName,
  listFixedAssetsForPeriod,
  mapFixedAssetToPreview,
  mapOpeningJournalToRecord,
  nextOpeningCarryoverId,
  openingDraftBusinessRate,
  replaceLoadedFixedAssets,
  resolveBookAccountId,
  resolveCategoryId,
  resolveFixedAssetDraftBusinessRate,
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
  listFixedAssets: (fiscalPeriodId?: string) => FixedAssetPreviewItem[];
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
  const assetMutationVersions = useRef(new AsyncStateVersion<string>());
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
                bookAccountNameById[asset.bookAccountId],
                fixedAssetPreviewAsOf,
                currentFiscalPeriodEndDate,
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
          undefined,
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
              bookAccountNameById[created.bookAccountId],
              fixedAssetPreviewAsOf,
              currentFiscalPeriodEndDate,
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
        periodVersions.current.invalidate(fiscalPeriodId);
        const mutationVersion = assetMutationVersions.current.invalidate(assetId);
        // ユーザーが科目名を変更した場合は draft 側を優先して解決する。
        const accountId = resolveBookAccountId(
          current?.accountId,
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
        // 簿価・進捗・残期間は計算で導出するため保存しない。保存するのは
        // 償却計算の元になる「真実」の値（取得価額・取得日・耐用年数・事業割合）のみ。
        try {
          const patched = await backendApi.fixedAssets.patch(
            fiscalPeriodId,
            assetId,
            fixedAssetDraftToPatch(draft, accountId),
          );
          appState.assertAuthOperationCurrent(authOperationVersion);
          if (
            selectedFiscalPeriodId.current === fiscalPeriodId &&
            assetMutationVersions.current.isCurrent(assetId, mutationVersion)
          ) {
            const mapped = mapFixedAssetToPreview(
              patched,
              bookAccountNameById[patched.bookAccountId],
              fixedAssetPreviewAsOf,
              currentFiscalPeriodEndDate,
            );
            setFixedAssets((currentList) =>
              upsertFixedAsset(currentList, mapped),
            );
          }
          return true;
        } finally {
          periodVersions.current.invalidate(fiscalPeriodId);
        }
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
        const debitAccountId =
          resolveBookAccountId(
            draft.debitBookAccountId,
            draft.debit,
            draft.debitType,
            {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
            },
          ) ?? "";
        const creditAccountId =
          resolveBookAccountId(
            draft.creditBookAccountId,
            draft.credit,
            draft.creditType,
            {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
            },
          ) ?? "";
        if (debitAccountId === "" || creditAccountId === "") {
          throw new AppError({
            messageForDeveloper:
              "assist.addOpeningCarryover: account resolution failed",
            messageForUser:
              "勘定科目が取得できないため再振替仕訳を作成できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
        let nextId: string | null = null;
        const updated = await appState.updateFiscalPeriod(
          fiscalPeriodId,
          (currentPeriod) => {
            const currentOpening = currentPeriod.opening;
            if (currentOpening == null) return null;
            nextId = nextOpeningCarryoverId(
              fiscalPeriodId,
              currentOpening.openingJournals ?? [],
            );
            const newJournal = {
              id: nextId,
              date: draft.date,
              description: draft.description,
              businessRate: openingDraftBusinessRate(draft),
              lines: [
                {
                  id: `${nextId}-d`,
                  side: "debit" as const,
                  bookAccountId: debitAccountId,
                  amount: parseAmount(draft.debitAmount),
                  partnerName: draft.partner,
                  taxCategoryId: resolveCategoryId(
                    draft.taxCategory,
                    taxCategoryIdByValue,
                    "tax_out_of_scope",
                  ),
                  businessCategoryId: resolveCategoryId(
                    draft.businessCategory,
                    businessCategoryIdByValue,
                    "biz_none",
                  ),
                },
                {
                  id: `${nextId}-c`,
                  side: "credit" as const,
                  bookAccountId: creditAccountId,
                  amount: parseAmount(draft.creditAmount),
                  partnerName: draft.partner,
                  taxCategoryId: resolveCategoryId(
                    draft.taxCategory,
                    taxCategoryIdByValue,
                    "tax_out_of_scope",
                  ),
                  businessCategoryId: resolveCategoryId(
                    draft.businessCategory,
                    businessCategoryIdByValue,
                    "biz_none",
                  ),
                },
              ],
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
        const debitAccountId =
          resolveBookAccountId(
            draft.debitBookAccountId,
            draft.debit,
            draft.debitType,
            {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
            },
          ) ?? "";
        const creditAccountId =
          resolveBookAccountId(
            draft.creditBookAccountId,
            draft.credit,
            draft.creditType,
            {
              accountIdsByName: bookAccountIdsByName,
              accountTypeById: bookAccountTypeById,
            },
          ) ?? "";
        if (debitAccountId === "" || creditAccountId === "") {
          throw new AppError({
            messageForDeveloper:
              "assist.updateOpeningCarryover: account resolution failed",
            messageForUser: "勘定科目が解決できないため保存できませんでした",
            originalMessage: null,
            statusCode: null,
          });
        }
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
            const nextJournal = {
              ...target,
              date: draft.date,
              description: draft.description,
              businessRate: openingDraftBusinessRate(draft),
              lines: [
                {
                  id:
                    target.lines.find((line) => line.side === "debit")?.id ??
                    `${target.id}-d`,
                  side: "debit" as const,
                  bookAccountId: debitAccountId,
                  amount: parseAmount(draft.debitAmount),
                  partnerName: draft.partner,
                  taxCategoryId: resolveCategoryId(
                    draft.taxCategory,
                    taxCategoryIdByValue,
                    "tax_out_of_scope",
                  ),
                  businessCategoryId: resolveCategoryId(
                    draft.businessCategory,
                    businessCategoryIdByValue,
                    "biz_none",
                  ),
                },
                {
                  id:
                    target.lines.find((line) => line.side === "credit")?.id ??
                    `${target.id}-c`,
                  side: "credit" as const,
                  bookAccountId: creditAccountId,
                  amount: parseAmount(draft.creditAmount),
                  partnerName: draft.partner,
                  taxCategoryId: resolveCategoryId(
                    draft.taxCategory,
                    taxCategoryIdByValue,
                    "tax_out_of_scope",
                  ),
                  businessCategoryId: resolveCategoryId(
                    draft.businessCategory,
                    businessCategoryIdByValue,
                    "biz_none",
                  ),
                },
              ],
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
        periodVersions.current.invalidate(fiscalPeriodId);
        const mutationVersion = assetMutationVersions.current.invalidate(assetId);
        try {
          await backendApi.fixedAssets.remove(fiscalPeriodId, assetId);
          appState.assertAuthOperationCurrent(authOperationVersion);
          if (
            selectedFiscalPeriodId.current === fiscalPeriodId &&
            assetMutationVersions.current.isCurrent(assetId, mutationVersion)
          ) {
            setFixedAssets((currentList) =>
              currentList.filter((asset) => asset.id !== assetId),
            );
          }
          return true;
        } finally {
          periodVersions.current.invalidate(fiscalPeriodId);
        }
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
