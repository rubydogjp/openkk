import type {
  BrandConfig,
  FiscalPeriodSeedProvider,
  OpenkkBackendPort,
  OpenkkCalloutSlots,
  OpenkkConfig,
} from "@rubydogjp/openkk-client";

export interface OpenkkBundleRuntime {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  calloutSlots: OpenkkCalloutSlots;
  seedFiscalPeriod?: FiscalPeriodSeedProvider;
  createBackendApi: () => Promise<OpenkkBackendPort>;
  registerServiceWorker: boolean;
}
