import { describe, it } from "vitest";

import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { BACKEND_CONTRACT_CASES } from "@rubydogjp/openkk-driver/backend-contract";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { createOpenkkEmbeddedBackendAdapter } from "./index.js";

describe("backend port contract over the embedded backend", () => {
  it.each(BACKEND_CONTRACT_CASES)("$name", async (contractCase) => {
    await contractCase.run(async () => ({
      backend: createOpenkkEmbeddedBackendAdapter(
        createOpenkkBackendApi(await createMemoryDbAdapter(null), {
          userId: "contract-user",
        }),
      ),
      close: async () => {},
    }));
  });
});
