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

import { BackendApiProvider, useBackendApi } from "./backend-api-context";

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
  const isActive = status?.enabled === true;

  const refreshStatus = useCallback(async () => {
    try {
      const fetched = await api.maintenance.get();
      setStatus(fetched.enabled ? fetched : null);
    } catch (error) {
      if (isMaintenanceModeError(error)) {
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
      <BackendApiProvider api={wrappedApi}>
        {props.children}
      </BackendApiProvider>
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
  return wrapNode(api, onMaintenance) as OpenkkBackendPort;
}

function wrapNode<T extends object>(target: T, onMaintenance: () => void): T {
  return new Proxy(target, {
    get(node, key, receiver) {
      const value = Reflect.get(node, key, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(
            node,
            args,
          );
          if (result instanceof Promise) {
            return result.catch((error: unknown) => {
              if (isMaintenanceModeError(error)) onMaintenance();
              throw error;
            });
          }
          return result;
        };
      }
      if (value != null && typeof value === "object") {
        return wrapNode(value as object, onMaintenance);
      }
      return value;
    },
  });
}
