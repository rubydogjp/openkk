import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { createDiskDbAdapter } from "@rubydogjp/openkk-disk-db-adapter";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import type { CliBook } from "@rubydogjp/openkk-frontend-cli";

export async function openCliBook(
  filePath: string,
  userId: string,
): Promise<CliBook> {
  const adapter = await createDiskDbAdapter(filePath, null);
  const backendApi = createOpenkkBackendApi(adapter.db, { userId });
  return {
    backend: createOpenkkEmbeddedBackendAdapter(backendApi),
    close: () => adapter.close(),
  };
}
