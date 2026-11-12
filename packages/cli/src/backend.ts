import type { OpenkkBackendPort } from "@rubydogjp/openkk-driver";
import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createDiskDbAdapter } from "@rubydogjp/openkk-disk-db-adapter";

export type CliBackend = {
  api: OpenkkBackendPort;
  close(): void;
};

export async function openCliBackend(
  filePath: string,
  userId: string,
): Promise<CliBackend> {
  const adapter = await createDiskDbAdapter(filePath, null);
  const backendApi = createOpenkkBackendApi(adapter.db, { userId });
  return {
    api: createOpenkkEmbeddedBackendAdapter(backendApi),
    close: () => adapter.close(),
  };
}
