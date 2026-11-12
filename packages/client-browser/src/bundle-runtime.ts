import type {
  BrandConfig,
  OpenkkBackendPort,
  OpenkkBookFilesPort,
  OpenkkConfig,
} from "@rubydogjp/openkk-driver";
import type { OpenkkCalloutSlots } from "@rubydogjp/openkk-frontend-ui";

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
