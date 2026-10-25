import type {
  BrandConfig,
  OpenkkBackendPort,
  OpenkkCalloutSlots,
  OpenkkConfig,
} from "@rubydogjp/openkk-client";

export type OpenkkBootEvents = {
  onWaitingForAnotherTab: () => void;
};

export interface OpenkkBundleRuntime {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  calloutSlots: OpenkkCalloutSlots;
  createBackendApi: (events: OpenkkBootEvents) => Promise<OpenkkBackendPort>;
  registerServiceWorker: boolean;
}
