import type { OpenkkConfig } from "../../domain/index.js";
import type { EntryUpsertInput } from "../../ports/index.js";
import type { OpenkkAppStore } from "../session/app-store.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";

export type OpenkkClosing = {
  runPreClosing: (fiscalPeriodId: string) => Promise<void>;
  runFinal: (
    fiscalPeriodId: string,
    entries: EntryUpsertInput[],
  ) => Promise<void>;
  cancelPreClosing: (fiscalPeriodId: string) => Promise<void>;
};

export function createOpenkkClosing(dependencies: {
  config: OpenkkConfig;
  app: OpenkkAppStore;
}): OpenkkClosing {
  const { config, app } = dependencies;
  const backend = app.backend;
  return {
    async runPreClosing(fiscalPeriodId) {
      assertEditingUnlocked(config.editingPolicy, "closing.runPreClosing");
      const authOperationVersion = app.getState().captureAuthOperationVersion();
      const period = await backend.preClosings.run(fiscalPeriodId);
      app.getState().assertAuthOperationCurrent(authOperationVersion);
      app.getState().syncFiscalPeriod(period);
    },
    async runFinal(fiscalPeriodId, entries) {
      assertEditingUnlocked(config.editingPolicy, "closing.runFinal");
      const authOperationVersion = app.getState().captureAuthOperationVersion();
      const period = await backend.closings.run(fiscalPeriodId, entries);
      app.getState().assertAuthOperationCurrent(authOperationVersion);
      app.getState().syncFiscalPeriod(period);
    },
    async cancelPreClosing(fiscalPeriodId) {
      assertEditingUnlocked(config.editingPolicy, "closing.cancelPreClosing");
      const authOperationVersion = app.getState().captureAuthOperationVersion();
      const period = await backend.preClosings.cancel(fiscalPeriodId);
      app.getState().assertAuthOperationCurrent(authOperationVersion);
      app.getState().syncFiscalPeriod(period);
    },
  };
}
