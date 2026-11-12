import {
  isMaintenanceModeError,
  type MaintenanceStatus,
  type OpenkkBackendPort,
} from "../../ports/index.js";
import { AsyncStateVersion } from "../shared/async-state-version.js";
import {
  createWritableState,
  type ReadableState,
} from "../shared/observable-state.js";
import { observeRejectedCalls } from "../shared/observe-rejected-calls.js";

const MAINTENANCE_RECHECK_INTERVAL_MS = 30_000;

const FALLBACK_MAINTENANCE_STATUS: MaintenanceStatus = {
  enabled: true,
  title: "メンテナンス中",
  message:
    "ただいまメンテナンスを実施しています。しばらく経ってから再度お試しください。",
  updatedAt: null,
};

export type MaintenanceState = {
  status: MaintenanceStatus | null;
};

export const NO_MAINTENANCE: MaintenanceState = { status: null };

export type MaintenanceStore = ReadableState<MaintenanceState> & {
  backend: OpenkkBackendPort;
  start(): () => void;
};

export function createMaintenanceStore(
  sourceBackend: OpenkkBackendPort,
): MaintenanceStore {
  const state = createWritableState<MaintenanceState>(NO_MAINTENANCE);
  const refreshVersions = new AsyncStateVersion();
  let recheckTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const setStatus = (status: MaintenanceStatus | null) => {
    if (state.getState().status === status) return;
    state.setState({ status });
    syncRecheckTimer();
  };

  const syncRecheckTimer = () => {
    const isActive = started && state.getState().status?.enabled === true;
    if (isActive && recheckTimer == null) {
      recheckTimer = setInterval(() => {
        void refreshStatus();
      }, MAINTENANCE_RECHECK_INTERVAL_MS);
    } else if (!isActive && recheckTimer != null) {
      clearInterval(recheckTimer);
      recheckTimer = null;
    }
  };

  const refreshStatus = async () => {
    const refreshVersion = refreshVersions.invalidate();
    try {
      const fetched = await sourceBackend.maintenance.get();
      if (!refreshVersions.isCurrent(refreshVersion)) return;
      setStatus(fetched.enabled ? fetched : null);
    } catch (error) {
      if (
        refreshVersions.isCurrent(refreshVersion) &&
        isMaintenanceModeError(error)
      ) {
        setStatus(state.getState().status ?? FALLBACK_MAINTENANCE_STATUS);
      }
    }
  };

  const enterMaintenance = () => {
    setStatus(state.getState().status ?? FALLBACK_MAINTENANCE_STATUS);
    void refreshStatus();
  };

  return {
    getState: state.getState,
    subscribe: state.subscribe,
    backend: observeRejectedCalls(sourceBackend, () => (error) => {
      if (isMaintenanceModeError(error)) enterMaintenance();
    }),
    start() {
      started = true;
      syncRecheckTimer();
      void refreshStatus();
      return () => {
        started = false;
        refreshVersions.invalidate();
        syncRecheckTimer();
      };
    },
  };
}
