"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  AppError,
  NO_MAINTENANCE,
  type AssistState,
  type EntriesState,
  type FiscalPeriod,
  type MaintenanceState,
  type OpenkkAppState,
  type OpenkkClosing,
  type OpenkkDriver,
  type ReadableState,
} from "@rubydogjp/openkk-driver";

import { OpenkkBookFilesProvider } from "./book-files/book-files-context.js";
import { BackendProvider } from "./shared/backend-context.js";
import { OpenkkConfigAndTodayProvider } from "./shared/openkk-config-context.js";
import { PlatformAdapterProvider } from "./shared/platform-adapter-context.js";
import { PrintAdapterProvider } from "./shared/print-adapter-context.js";
import { useReadableState } from "./shared/readable-state.js";

const OpenkkDriverContext = createContext<OpenkkDriver | null>(null);

const MAINTENANCE_WITHOUT_DRIVER: ReadableState<MaintenanceState> = {
  getState: () => NO_MAINTENANCE,
  subscribe: () => () => {},
};

export function OpenkkDriverProvider(props: {
  driver: OpenkkDriver;
  children: ReactNode;
}) {
  const { driver } = props;
  useEffect(() => driver.start(), [driver]);

  return (
    <OpenkkDriverContext.Provider value={driver}>
      <OpenkkConfigAndTodayProvider config={driver.config} today={driver.today}>
        <PlatformAdapterProvider adapter={driver.platform}>
          <PrintAdapterProvider adapter={driver.print}>
            <OpenkkBookFilesProvider bookFiles={driver.bookFiles}>
              <BackendProvider backend={driver.backend}>
                {props.children}
              </BackendProvider>
            </OpenkkBookFilesProvider>
          </PrintAdapterProvider>
        </PlatformAdapterProvider>
      </OpenkkConfigAndTodayProvider>
    </OpenkkDriverContext.Provider>
  );
}

function useOpenkkDriver(): OpenkkDriver {
  const driver = useContext(OpenkkDriverContext);
  if (driver == null) {
    throw new AppError({
      messageForDeveloper:
        "the shared state hooks must be used within OpenkkDriverProvider",
      messageForUser: "アプリの状態を読み込めませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return driver;
}

export function useOpenkkAppState(): OpenkkAppState {
  return useReadableState(useOpenkkDriver().app);
}

export function useOpenkkEntries(): EntriesState {
  return useReadableState(useOpenkkDriver().entries);
}

export function useOpenkkAssist(): AssistState {
  return useReadableState(useOpenkkDriver().assist);
}

export function useMaintenance(): MaintenanceState {
  const driver = useContext(OpenkkDriverContext);
  return useReadableState(driver?.maintenance ?? MAINTENANCE_WITHOUT_DRIVER);
}

export function useOpenkkClosing(): OpenkkClosing {
  return useOpenkkDriver().closing;
}

export function useFiscalPeriodArchiveExport(): (
  fiscalPeriod: FiscalPeriod,
) => Promise<Uint8Array> {
  return useOpenkkDriver().exportFiscalPeriodArchive;
}
