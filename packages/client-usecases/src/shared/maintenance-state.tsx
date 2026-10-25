"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  isMaintenanceModeError,
  type MaintenanceStatus,
  type OpenkkBackendPort,
} from "@rubydogjp/openkk-client-ports";

import { BackendApiProvider, useBackendApi } from "./backend-api-context.js";
import { AsyncStateVersion } from "./async-state-version.js";
import { observeRejectedCalls } from "./observe-rejected-calls.js";

const MAINTENANCE_RECHECK_INTERVAL_MS = 30_000;

const FALLBACK_MAINTENANCE_STATUS: MaintenanceStatus = {
  enabled: true,
  title: "メンテナンス中",
  message:
    "ただいまメンテナンスを実施しています。しばらく経ってから再度お試しください。",
  updatedAt: null,
};

type MaintenanceState = {
  status: MaintenanceStatus | null;
};

const MaintenanceContext = createContext<MaintenanceState | null>(null);

export function OpenkkMaintenanceProvider(props: { children: ReactNode }) {
  const api = useBackendApi();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const refreshVersions = useRef(new AsyncStateVersion());
  const isActive = status?.enabled === true;

  const refreshStatus = useCallback(async () => {
    const refreshVersion = refreshVersions.current.invalidate();
    try {
      const fetched = await api.maintenance.get();
      if (!refreshVersions.current.isCurrent(refreshVersion)) return;
      setStatus(fetched.enabled ? fetched : null);
    } catch (error) {
      if (
        refreshVersions.current.isCurrent(refreshVersion) &&
        isMaintenanceModeError(error)
      ) {
        setStatus((prev) => prev ?? FALLBACK_MAINTENANCE_STATUS);
      }
    }
  }, [api]);

  const enterMaintenance = useCallback(() => {
    setStatus((prev) => prev ?? FALLBACK_MAINTENANCE_STATUS);
    void refreshStatus();
  }, [refreshStatus]);

  const wrappedApi = useMemo(
    () => wrapWithMaintenanceDetection(api, enterMaintenance),
    [api, enterMaintenance],
  );

  useEffect(
    () => () => {
      refreshVersions.current.invalidate();
    },
    [],
  );

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      void refreshStatus();
    }, MAINTENANCE_RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, refreshStatus]);

  const value = useMemo<MaintenanceState>(() => ({ status }), [status]);

  return (
    <MaintenanceContext.Provider value={value}>
      <BackendApiProvider api={wrappedApi}>{props.children}</BackendApiProvider>
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance(): MaintenanceState {
  const value = useContext(MaintenanceContext);
  return value ?? { status: null };
}

function wrapWithMaintenanceDetection(
  api: OpenkkBackendPort,
  onMaintenance: () => void,
): OpenkkBackendPort {
  return observeRejectedCalls(api, () => (error) => {
    if (isMaintenanceModeError(error)) onMaintenance();
  });
}
