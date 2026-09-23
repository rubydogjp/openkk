import type {
  BrandConfig,
  FiscalPeriodSeeder,
  OpenkkBackendPort,
  OpenkkCalloutSlots,
  OpenkkConfig,
} from "@rubydogjp/openkk-client";

export interface OpenkkBundleRuntime {
  config: OpenkkConfig;
  brandConfig: BrandConfig;
  calloutSlots: OpenkkCalloutSlots;
  seedFiscalPeriod: FiscalPeriodSeeder | null;
  createBackendApi: () => Promise<OpenkkBackendPort>;
  registerServiceWorker: boolean;
}
