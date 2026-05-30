import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";
import type { OpenkkServerPort } from "@rubydogjp/openkk-embedded-backend";

export function createOpenkkEmbeddedBackendAdapter(
  server: OpenkkServerPort,
): OpenkkBackendPort {
  return server as unknown as OpenkkBackendPort;
}
