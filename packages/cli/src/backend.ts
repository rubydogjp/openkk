import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createNodeSqliteDbAdapter } from "@rubydogjp/openkk-node-sqlite-db-adapter";

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
