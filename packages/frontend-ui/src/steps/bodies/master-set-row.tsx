"use client";

import { useRef, useState } from "react";

import {
  AppError,
  masterSetName,
  newerMasterSetFor,
  type FiscalPeriod,
  type MasterSetSummary,
} from "@rubydogjp/openkk-driver";
import { useOpenkkAppState, useOpenkkEntries } from "../../bindings/index.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import { FormReadOnlyValue } from "../../shared/form-fields.js";
import { useOpenkkNotices } from "../../shared/notices/notices.js";
import { StepFormRow, StepSecondaryButton } from "../step-ui.js";

const MASTER_SET_ROW_LABEL = "科目と区分";

export function masterSetSwitchTarget(
  fiscalPeriod: Pick<FiscalPeriod, "phase" | "startDate" | "masterSetId">,
  masterSets: ReadonlyArray<MasterSetSummary>,
  editingLocked: boolean,
): MasterSetSummary | null {
  if (editingLocked) return null;
  if (
    fiscalPeriod.phase !== "pre_opening" &&
    fiscalPeriod.phase !== "journalizing"
  ) {
    return null;
  }
  return newerMasterSetFor(fiscalPeriod, masterSets);
}

export function masterSetSwitchBody(target: MasterSetSummary): string[] {
  return [
    `仕訳はそのままです。${target.name}にない科目や区分は「カスタム(…)」と出ます。`,
  ];
}

export function MasterSetRow({
  fiscalPeriod,
  editingLocked,
}: {
  fiscalPeriod: FiscalPeriod;
  editingLocked: boolean;
}) {
  const appState = useOpenkkAppState();
  const { masterSets } = useOpenkkEntries();
  const { confirm, dialog } = useConfirmDialog();
  const switchLock = useRef(new ExclusiveActionLock());
  const notices = useOpenkkNotices();
  const [isSwitching, setIsSwitching] = useState(false);
  const currentName = masterSetName(fiscalPeriod.masterSetId, masterSets);
  const target = masterSetSwitchTarget(fiscalPeriod, masterSets, editingLocked);

  const handleSwitch = async () => {
    if (target == null) return;
    const release = switchLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "success",
        title: "科目と区分の切り替え",
        body: masterSetSwitchBody(target),
        confirmLabel: "切り替える",
      });
      if (!confirmed) return;
      setIsSwitching(true);
      await appState.updateFiscalPeriod(fiscalPeriod.id, {
        masterSetId: target.id,
      });
    } catch (error) {
      notices.show({
        tone: "danger",
        message: AppError.from(error, {
          fallbackUserMessage: "科目と区分を切り替えられませんでした",
          fallbackDeveloperMessage: "steps/master-set-row: switch failed",
          statusCode: null,
        }).messageForUser,
      });
    } finally {
      setIsSwitching(false);
      release();
    }
  };

  return (
    <>
      {dialog}
      <StepFormRow
        label={MASTER_SET_ROW_LABEL}
        divider
        control={
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
            }}
          >
            <FormReadOnlyValue width={200}>{currentName}</FormReadOnlyValue>
            {target != null ? (
              <StepSecondaryButton onClick={handleSwitch}>
                {isSwitching ? "切り替え中…" : `${target.name}に切り替える`}
              </StepSecondaryButton>
            ) : null}
          </div>
        }
        hint={null}
      />
    </>
  );
}
