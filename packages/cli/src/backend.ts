import type { OpenkkBackendPort } from "@rubydogjp/openkk-driver";
import {
  createOpenkkEmbeddedBackend,
  createOpenkkEmbeddedBackendAdapter,
} from "@rubydogjp/openkk-embedded-backend-adapter";
import { createNodeSqliteDbAdapter } from "@rubydogjp/openkk-disk-db-adapter";

export type CliBackend = {
  api: OpenkkBackendPort;
  close(): void;
};

export async function openCliBackend(
  filePath: string,
  userId: string,
): Promise<CliBackend> {
  const adapter = await createNodeSqliteDbAdapter(filePath, null);
  const server = createOpenkkEmbeddedBackend(adapter.db, { userId });
  return {
    api: createOpenkkEmbeddedBackendAdapter(server),
    close: () => adapter.close(),
  };
}
