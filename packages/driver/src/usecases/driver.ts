import type { OpenkkConfig } from "../domain/index.js";
import type {
  OpenkkBackendPort,
  OpenkkBookFilesPort,
  PlatformPort,
  PrintPort,
} from "../ports/index.js";
import {
  createOpenkkAssistStore,
  type AssistState,
} from "./assist/assist-store.js";
import { createOpenkkClosing, type OpenkkClosing } from "./closing/closing.js";
import {
  createOpenkkEntriesStore,
  type EntriesState,
} from "./entries/entries-store.js";
import {
  createMaintenanceStore,
  type MaintenanceState,
} from "./maintenance/maintenance-store.js";
import {
  createOpenkkAppStore,
  type OpenkkAppState,
} from "./session/app-store.js";
import type { ReadableState } from "./shared/observable-state.js";
import { createTodayState } from "./shared/today-state.js";

export type OpenkkDriverPorts = {
  backend: OpenkkBackendPort;
  platform: PlatformPort;
  print: PrintPort;
  bookFiles: OpenkkBookFilesPort | null;
};

export type OpenkkDriver = {
  config: OpenkkConfig;
  backend: OpenkkBackendPort;
  platform: PlatformPort;
  print: PrintPort;
  bookFiles: OpenkkBookFilesPort | null;
  today: ReadableState<Date>;
  maintenance: ReadableState<MaintenanceState>;
  app: ReadableState<OpenkkAppState>;
  entries: ReadableState<EntriesState>;
  assist: ReadableState<AssistState>;
  closing: OpenkkClosing;
  start(): () => void;
};

export function createOpenkkDriver(
  config: OpenkkConfig,
  ports: OpenkkDriverPorts,
): OpenkkDriver {
  const today = createTodayState(config.clock);
  const maintenance = createMaintenanceStore(ports.backend);
  const app = createOpenkkAppStore({
    config,
    backend: maintenance.backend,
    storage: ports.platform.storage,
  });
  const entries = createOpenkkEntriesStore({ config, app });
  const assist = createOpenkkAssistStore({ config, app, today });
  const startInOrder = [today, maintenance, app, entries, assist];
  return {
    config,
    backend: app.backend,
    platform: ports.platform,
    print: ports.print,
    bookFiles: ports.bookFiles,
    today,
    maintenance,
    app,
    entries,
    assist,
    closing: createOpenkkClosing({ config, app }),
    start() {
      const stops = startInOrder.map((state) => state.start());
      return () => {
        for (const stop of stops.reverse()) stop();
      };
    },
  };
}
