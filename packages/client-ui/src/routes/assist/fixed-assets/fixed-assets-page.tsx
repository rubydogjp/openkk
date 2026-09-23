"use client";

import { useRouter, useSearchParams } from "next/navigation.js";
import { useCallback, useEffect, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkConfig,
  useOpenkkToday,
} from "@rubydogjp/openkk-client-usecases";
import {
  buildPeriodLockMessage,
  capFixedAssetPreviewDate,
  fixedAssetToDraft,
  formatIsoLocalDate,
  resolveEditingPolicy,
  type FixedAssetDraft,
} from "@rubydogjp/openkk-client-domain";
import { ClosedPeriodLock } from "../../../shared/closed-period-lock.js";
import { LockButton } from "../../../shared/locked-action.js";
import { FixedAssetEditDrawer } from "../../../assist/fixed-asset-edit-drawer.js";
import { FixedAssetsScreen } from "../../../assist/fixed-assets-screen.js";

export function FixedAssetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assistState = useOpenkkAssist();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const today = useOpenkkToday();
  const editingLocked = resolveEditingPolicy(openkkConfig.editingPolicy).locked;
  const [newAssetDraft, setNewAssetDraft] =
    useState<FixedAssetDraft | null>(null);

  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (p) => p.id === appState.currentFiscalPeriodId,
  );
  const lockMessage = buildPeriodLockMessage(currentFiscalPeriod ?? null, null);
  const isReadOnlyPeriod =
    currentFiscalPeriod?.phase === "post_closing" ||
    currentFiscalPeriod?.phase === "pre_closing";
  const screenLockMessage = isReadOnlyPeriod ? null : lockMessage;
  const fixedAssetPreviewAsOf = capFixedAssetPreviewDate(
    today,
    currentFiscalPeriod?.endDate ?? null,
  );

  const drawerAssetId = searchParams.get("asset");
  const candidateDrawerAsset =
    drawerAssetId == null ? null : assistState.getFixedAsset(drawerAssetId);
  const drawerAsset =
    candidateDrawerAsset?.fiscalPeriodId === currentFiscalPeriod?.id
      ? candidateDrawerAsset
      : null;

  useEffect(() => {
    setNewAssetDraft(null);
  }, [currentFiscalPeriod?.id]);

  const navigateWithAssetParam = useCallback(
    (assetId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (assetId == null) {
        next.delete("asset");
      } else {
        next.set("asset", assetId);
      }
      const query = next.toString();
      const url =
        query.length > 0
          ? `/assist/fixed-assets?${query}`
          : "/assist/fixed-assets";
      router.replace(url, { scroll: false });
    },
    [router, searchParams],
  );

  if (screenLockMessage != null) {
    return (
      <ClosedPeriodLock
        title={screenLockMessage.title}
        description={screenLockMessage.description}
      />
    );
  }
  if (currentFiscalPeriod == null) return null;

  return (
    <>
      <FixedAssetsScreen
        items={assistState.listFixedAssets(currentFiscalPeriod.id)}
        readOnly={isReadOnlyPeriod}
        onAdd={
          editingLocked || isReadOnlyPeriod
            ? null
            : () => {
                navigateWithAssetParam(null);
                setNewAssetDraft(
                  buildNewFixedAssetDraft(
                    currentFiscalPeriod.startDate,
                    today,
                  ),
                );
              }
        }
        onOpenItem={
          isReadOnlyPeriod || editingLocked
            ? null
            : (itemId) => navigateWithAssetParam(itemId)
        }
        addButtonSlot={
          !isReadOnlyPeriod && editingLocked ? (
            <LockButton label="追加" style={null} />
          ) : null
        }
        contentMaxWidth={null}
      />
      {drawerAsset != null && !isReadOnlyPeriod && !editingLocked ? (
        <FixedAssetEditDrawer
          key={`edit:${drawerAsset.id}`}
          mode="edit"
          initialDraft={fixedAssetToDraft(drawerAsset)}
          periodStartDate={currentFiscalPeriod.startDate}
          periodEndDate={currentFiscalPeriod.endDate}
          previewAsOf={fixedAssetPreviewAsOf}
          editingLocked={editingLocked}
          onClose={() => navigateWithAssetParam(null)}
          onSave={async (draft) => {
            return await assistState.updateFixedAsset(drawerAsset.id, draft);
          }}
          onDelete={async () => {
            const ok = await assistState.deleteFixedAsset(drawerAsset.id);
            if (ok) {
              navigateWithAssetParam(null);
            }
            return ok;
          }}
        />
      ) : null}
      {newAssetDraft != null && !isReadOnlyPeriod && !editingLocked ? (
        <FixedAssetEditDrawer
          key="create"
          mode="create"
          initialDraft={newAssetDraft}
          periodStartDate={currentFiscalPeriod.startDate}
          periodEndDate={currentFiscalPeriod.endDate}
          previewAsOf={fixedAssetPreviewAsOf}
          editingLocked={editingLocked}
          onClose={() => setNewAssetDraft(null)}
          onSave={async (draft) => {
            const createdId = await assistState.addFixedAsset(draft);
            if (createdId != null) {
              setNewAssetDraft(null);
              return true;
            }
            return false;
          }}
          onDelete={null}
        />
      ) : null}
    </>
  );
}

function buildNewFixedAssetDraft(
  periodStartDate: string | null,
  today: Date,
): FixedAssetDraft {
  const acquisitionDate = periodStartDate ?? formatIsoLocalDate(today);
  return {
    name: "",
    account: "工具器具備品",
    acquisitionCost: "",
    status: "償却中",
    acquisitionDate,
    usefulLife: 3,
    businessRatePercent: 100,
    businessRate: 1,
    disposalDate: null,
    disposalPrice: null,
  };
}
