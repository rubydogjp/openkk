

export * from "@rubydogjp/openkk-server-domain";
export * from "@rubydogjp/openkk-server-ports";
export * from "@rubydogjp/openkk-server-usecases";
export * from "@rubydogjp/openkk-server-api";

import type { OpenkkDbPort, OpenkkServerPort } from "@rubydogjp/openkk-server-ports";
import { createServerUsecases } from "@rubydogjp/openkk-server-usecases";
import {
  createOpenkkServerApi,
  type OpenkkServerConfig,
} from "@rubydogjp/openkk-server-api";

export function createOpenkkServer(
  db: OpenkkDbPort,
  config: OpenkkServerConfig,
): OpenkkServerPort {
  const usecases = createServerUsecases(db);
  return createOpenkkServerApi(usecases, config);
}
