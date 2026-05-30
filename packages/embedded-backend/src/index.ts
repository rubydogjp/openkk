import {
  createOpenkkServer,
  type OpenkkDbPort,
  type OpenkkServerPort,
} from "@rubydogjp/openkk-server";

export type OpenkkEmbeddedBackendConfig = {
  userId: string;
};

export function createOpenkkEmbeddedBackend(
  db: OpenkkDbPort,
  config: OpenkkEmbeddedBackendConfig,
): OpenkkServerPort {
  return createOpenkkServer(db, { userId: config.userId });
}

export type { OpenkkDbPort };
export type { OpenkkServerPort };
