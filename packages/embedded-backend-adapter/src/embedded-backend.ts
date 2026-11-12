import { createOpenkkServer } from "@rubydogjp/openkk-backend-api";
import type { OpenkkDbPort, OpenkkServerPort } from "@rubydogjp/openkk-engine";

export type OpenkkEmbeddedBackendConfig = {
  userId: string;
};

export function createOpenkkEmbeddedBackend(
  db: OpenkkDbPort,
  config: OpenkkEmbeddedBackendConfig,
): OpenkkServerPort {
  return createOpenkkServer(db, config);
}
