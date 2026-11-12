import type {
  BrandConfig,
  OpenkkBackendPort,
  OpenkkBookFilesPort,
  OpenkkCalloutSlots,
  OpenkkConfig,
} from "@rubydogjp/openkk-client";

export type OpenkkBootEvents = {
  onWaitingForAnotherTab: () => void;
};

export type OpenkkBundleBackend = {
  api: OpenkkBackendPort;
  bookFiles: OpenkkBookFilesPort | null;
};

export interface OpenkkBundleRuntime {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  calloutSlots: OpenkkCalloutSlots;
  createBackend: (events: OpenkkBootEvents) => Promise<OpenkkBundleBackend>;
  registerServiceWorker: boolean;
}
