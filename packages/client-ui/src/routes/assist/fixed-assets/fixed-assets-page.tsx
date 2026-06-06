"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  buildPeriodLockMessage,
  formatIsoLocalDate,
  type FixedAssetPreviewItem,
} from "@rubydogjp/openkk-client-domain";
import { ClosedPeriodLock } from "../../../shared/closed-period-lock";
import { DemoLockButton } from "../../../shared/demo-icon";
import { FixedAssetEditDrawer } from "../../../assist/fixed-asset-edit-drawer";
import { FixedAssetsScreen } from "../../../assist/fixed-assets-screen";

export function FixedAssetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assistState = useOpenkkAssist();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const isDemo = openkkConfig.isDemoMode;
  const [newAssetDraft, setNewAssetDraft] =
    useState<FixedAssetPreviewItem | null>(null);

  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (p) => p.id === appState.currentFiscalPeriodId,
  );
  const fiscalPeriodId = appState.currentFiscalPeriodId ?? "";
  const lockMessage = buildPeriodLockMessage(currentFiscalPeriod);
  const isReadOnlyPeriod =
    currentFiscalPeriod?.phase === "post_closing" ||
    currentFiscalPeriod?.phase === "pre_closing";
  const screenLockMessage = isReadOnlyPeriod ? null : lockMessage;

  const drawerAssetId = searchParams.get("asset");
  const drawerAsset =
    drawerAssetId == null ? null : assistState.getFixedAsset(drawerAssetId);

  useEffect(() => {
    setNewAssetDraft((current) =>
      current == null || current.fiscalPeriodId === fiscalPeriodId
        ? current
        : null,
    );
  }, [fiscalPeriodId]);

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

  return (
    <>
      <FixedAssetsScreen
        items={assistState.listFixedAssets()}
        readOnly={isReadOnlyPeriod}
        onAdd={
          isDemo || isReadOnlyPeriod
            ? undefined
            : () => {
                navigateWithAssetParam(null);
                setNewAssetDraft(
                  buildNewFixedAssetDraft(
                    fiscalPeriodId,
                    currentFiscalPeriod?.startDate ?? null,
                    openkkConfig.today,
                  ),
                );
              }
        }
        onOpenItem={
          isReadOnlyPeriod
            ? undefined
            : (itemId) => navigateWithAssetParam(itemId)
        }
        addButtonSlot={
          !isReadOnlyPeriod && isDemo ? (
            <DemoLockButton label="追加" />
          ) : undefined
        }
      />
      {drawerAsset != null && !isReadOnlyPeriod ? (
        <FixedAssetEditDrawer
          asset={drawerAsset}
          isDemo={isDemo}
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
      {newAssetDraft != null && !isReadOnlyPeriod ? (
        <FixedAssetEditDrawer
          mode="create"
          asset={newAssetDraft}
          isDemo={isDemo}
          onClose={() => setNewAssetDraft(null)}
          onSave={async (draft) => {
            const createdId = await assistState.addFixedAsset(draft);
            if (createdId != null) {
              setNewAssetDraft(null);
              return true;
            }
            return false;
          }}
        />
      ) : null}
    </>
  );
}

function buildNewFixedAssetDraft(
  fiscalPeriodId: string,
  periodStartDate: string | null,
  today: Date,
): FixedAssetPreviewItem {
  const acquisitionDate = periodStartDate ?? formatIsoLocalDate(today);
  return {
    id: "__new_fixed_asset__",
    fiscalPeriodId,
    name: "",
    account: "工具器具備品",
    period: "",
    remaining: "",
    progress: 0,
    current: "0",
    purchase: "",
    status: "償却中",
    acquisitionDate,
    usefulLife: 3,
    businessRate: 1,
  };
}
