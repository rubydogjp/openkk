import type { OpenkkConfig } from "./openkk-config.js";
import type { OpenkkUser } from "./user.js";

export function buildBootstrapUser(config: OpenkkConfig): OpenkkUser | null {
  return config.authMode === "embedded" ? config.embeddedUser : null;
}

export function buildBootstrapFiscalPeriodId(
  config: OpenkkConfig,
): string | null {
  return config.authMode === "embedded" ? config.initialFiscalPeriodId : null;
}
