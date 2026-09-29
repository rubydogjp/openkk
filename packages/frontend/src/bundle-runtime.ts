import type {
  BrandConfig,
  FiscalPeriodSeeder,
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
  seedFiscalPeriod: FiscalPeriodSeeder | null;
  createBackendApi: (events: OpenkkBootEvents) => Promise<OpenkkBackendPort>;
  registerServiceWorker: boolean;
}
