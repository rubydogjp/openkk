import {
  isOpenkkApiErrorDto,
  OPENKK_HTTP_ENDPOINTS,
  resolveOpenkkHttpResponse,
  type OpenkkApiErrorDto,
  type OpenkkBackendPort,
  type OpenkkHttpEndpointKey,
  type OpenkkHttpEndpointSpecs,
  type OpenkkHttpResponse,
} from "@rubydogjp/openkk-driver";
import type { OpenkkBackendApi } from "@rubydogjp/openkk-backend-api";

type EndpointRequest<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["request"];

type EndpointResponse<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["response"];

export function createOpenkkEmbeddedBackendAdapter(
  backendApi: OpenkkBackendApi,
): OpenkkBackendPort {
  const request = async <Key extends OpenkkHttpEndpointKey>(
    key: Key,
    body: EndpointRequest<Key>,
  ): Promise<EndpointResponse<Key>> => {
    const response = await dispatchEmbeddedHttp(
      backendApi,
      key,
      jsonRoundTrip(body),
    );
    return resolveOpenkkHttpResponse(key, jsonRoundTrip(response));
  };

  return {
    auth: {
      startSession: async (redirectUrl) =>
        request("authStartSession", { redirectUrl }),
      completeSession: async (state, code) =>
        request("authCompleteSession", { state, code }),
      redeemCompletionCode: async (completionCode) =>
        request("authRedeemCompletionCode", { completionCode }),
      signOut: async () => {
        await request("authSignOut", {});
      },
    },
    preClosings: {
      run: async (fiscalPeriodId) => {
        const response = await request("preClosingRun", { fiscalPeriodId });
        return response.fiscalPeriod;
      },
      cancel: async (fiscalPeriodId) => {
        const response = await request("preClosingCancel", { fiscalPeriodId });
        return response.fiscalPeriod;
      },
    },
    closings: {
      run: async (fiscalPeriodId, entries) => {
        const response = await request("closingRun", {
          fiscalPeriodId,
          entries,
        });
        return response.fiscalPeriod;
      },
    },
    entries: {
      getAll: async (fiscalPeriodId) => {
        const response = await request("entriesGetAll", { fiscalPeriodId });
        return response.entries;
      },
      create: async (fiscalPeriodId, input) => {
        const response = await request("entryCreate", {
          fiscalPeriodId,
          input,
        });
        return response.entry;
      },
      update: async (fiscalPeriodId, id, input) => {
        const response = await request("entryUpdate", {
          fiscalPeriodId,
          id,
          input,
        });
        return response.entry;
      },
      remove: async (fiscalPeriodId, id) => {
        await request("entryRemove", { fiscalPeriodId, id });
      },
      importMany: async (fiscalPeriodId, entries) =>
        request("entryImportMany", { fiscalPeriodId, entries }),
    },
    fiscalPeriods: {
      getAll: async () => {
        const response = await request("fiscalPeriodsGetAll", {});
        return response.fiscalPeriods;
      },
      create: async (input) => {
        const response = await request("fiscalPeriodCreate", { input });
        return response.fiscalPeriod;
      },
      createNext: async (input) => {
        const response = await request("fiscalPeriodNextCreate", { input });
        return response.fiscalPeriod;
      },
      applyCarryover: async (id, input) => {
        const response = await request("fiscalPeriodCarryoverApply", {
          id,
          input,
        });
        return response.fiscalPeriod;
      },
      applyCarryoverFromArchive: async (id, input) => {
        const response = await request(
          "fiscalPeriodCarryoverFromArchiveApply",
          { id, input },
        );
        return response.fiscalPeriod;
      },
      importArchived: async (input) => {
        const response = await request("fiscalPeriodImportArchived", { input });
        return response.fiscalPeriod;
      },
      patch: async (id, input) => {
        const response = await request("fiscalPeriodPatch", { id, input });
        return response.fiscalPeriod;
      },
      start: async (id) => {
        const response = await request("fiscalPeriodStart", { id });
        return response.fiscalPeriod;
      },
      remove: async (id) => {
        await request("fiscalPeriodRemove", { id });
      },
    },
    fixedAssets: {
      getAll: async (fiscalPeriodId) => {
        const response = await request("fixedAssetsGetAll", { fiscalPeriodId });
        return response.fixedAssets;
      },
      create: async (fiscalPeriodId, input) => {
        const response = await request("fixedAssetCreate", {
          fiscalPeriodId,
          input,
        });
        return response.fixedAsset;
      },
      patch: async (fiscalPeriodId, id, input) => {
        const response = await request("fixedAssetPatch", {
          fiscalPeriodId,
          id,
          input,
        });
        return response.fixedAsset;
      },
      remove: async (fiscalPeriodId, id) => {
        await request("fixedAssetRemove", { fiscalPeriodId, id });
      },
    },
    masterData: {
      getBookAccounts: async () => {
        const response = await request("masterBookAccounts", {});
        return response.bookAccounts;
      },
      getTaxCategories: async () => {
        const response = await request("masterTaxCategories", {});
        return response.taxCategories;
      },
      getBusinessCategories: async () => {
        const response = await request("masterBusinessCategories", {});
        return response.businessCategories;
      },
    },
    maintenance: {
      get: async () => request("maintenanceGet", {}),
    },
  };
}

const EMBEDDED_MAINTENANCE_STATUS = {
  enabled: false,
  title: "",
  message: "",
  updatedAt: null,
} as const;

async function dispatchEmbeddedHttp(
  backendApi: OpenkkBackendApi,
  key: OpenkkHttpEndpointKey,
  body: unknown,
): Promise<OpenkkHttpResponse> {
  try {
    return {
      status: OPENKK_HTTP_ENDPOINTS[key].successStatus,
      body: await embeddedResponseBody(backendApi, key, body),
    };
  } catch (error) {
    return backendErrorToEmbeddedHttpResponse(error);
  }
}

async function embeddedResponseBody(
  backendApi: OpenkkBackendApi,
  key: OpenkkHttpEndpointKey,
  body: unknown,
): Promise<unknown> {
  switch (key) {
    case "authStartSession": {
      const request = body as EndpointRequest<"authStartSession">;
      return await backendApi.auth.startSession(request.redirectUrl);
    }
    case "authCompleteSession": {
      const request = body as EndpointRequest<"authCompleteSession">;
      return await backendApi.auth.completeSession(request.state, request.code);
    }
    case "authRedeemCompletionCode": {
      const request = body as EndpointRequest<"authRedeemCompletionCode">;
      return await backendApi.auth.redeemCompletionCode(request.completionCode);
    }
    case "authSignOut":
      await backendApi.auth.signOut();
      return null;
    case "preClosingRun": {
      const request = body as EndpointRequest<"preClosingRun">;
      return {
        fiscalPeriod: await backendApi.preClosings.run(request.fiscalPeriodId),
      };
    }
    case "preClosingCancel": {
      const request = body as EndpointRequest<"preClosingCancel">;
      return {
        fiscalPeriod: await backendApi.preClosings.cancel(
          request.fiscalPeriodId,
        ),
      };
    }
    case "closingRun": {
      const request = body as EndpointRequest<"closingRun">;
      return {
        fiscalPeriod: await backendApi.closings.run(
          request.fiscalPeriodId,
          request.entries,
        ),
      };
    }
    case "entriesGetAll": {
      const request = body as EndpointRequest<"entriesGetAll">;
      return {
        entries: await backendApi.entries.getAll(request.fiscalPeriodId),
      };
    }
    case "entryCreate": {
      const request = body as EndpointRequest<"entryCreate">;
      return {
        entry: await backendApi.entries.create(
          request.fiscalPeriodId,
          request.input,
        ),
      };
    }
    case "entryUpdate": {
      const request = body as EndpointRequest<"entryUpdate">;
      return {
        entry: await backendApi.entries.update(
          request.fiscalPeriodId,
          request.id,
          request.input,
        ),
      };
    }
    case "entryRemove": {
      const request = body as EndpointRequest<"entryRemove">;
      await backendApi.entries.remove(request.fiscalPeriodId, request.id);
      return null;
    }
    case "entryImportMany": {
      const request = body as EndpointRequest<"entryImportMany">;
      return await backendApi.entries.importMany(
        request.fiscalPeriodId,
        request.entries,
      );
    }
    case "fiscalPeriodsGetAll":
      return { fiscalPeriods: await backendApi.fiscalPeriods.getAll() };
    case "fiscalPeriodCreate": {
      const request = body as EndpointRequest<"fiscalPeriodCreate">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.create(request.input),
      };
    }
    case "fiscalPeriodNextCreate": {
      const request = body as EndpointRequest<"fiscalPeriodNextCreate">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.createNext(request.input),
      };
    }
    case "fiscalPeriodCarryoverApply": {
      const request = body as EndpointRequest<"fiscalPeriodCarryoverApply">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.applyCarryover(
          request.id,
          request.input,
        ),
      };
    }
    case "fiscalPeriodCarryoverFromArchiveApply": {
      const request =
        body as EndpointRequest<"fiscalPeriodCarryoverFromArchiveApply">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.applyCarryoverFromArchive(
          request.id,
          request.input,
        ),
      };
    }
    case "fiscalPeriodImportArchived": {
      const request = body as EndpointRequest<"fiscalPeriodImportArchived">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.importArchived(
          request.input,
        ),
      };
    }
    case "fiscalPeriodPatch": {
      const request = body as EndpointRequest<"fiscalPeriodPatch">;
      return {
        fiscalPeriod: await backendApi.fiscalPeriods.patch(
          request.id,
          request.input,
        ),
      };
    }
    case "fiscalPeriodStart": {
      const request = body as EndpointRequest<"fiscalPeriodStart">;
      return { fiscalPeriod: await backendApi.fiscalPeriods.start(request.id) };
    }
    case "fiscalPeriodRemove": {
      const request = body as EndpointRequest<"fiscalPeriodRemove">;
      await backendApi.fiscalPeriods.remove(request.id);
      return null;
    }
    case "fixedAssetsGetAll": {
      const request = body as EndpointRequest<"fixedAssetsGetAll">;
      return {
        fixedAssets: await backendApi.fixedAssets.getAll(
          request.fiscalPeriodId,
        ),
      };
    }
    case "fixedAssetCreate": {
      const request = body as EndpointRequest<"fixedAssetCreate">;
      return {
        fixedAsset: await backendApi.fixedAssets.create(
          request.fiscalPeriodId,
          request.input,
        ),
      };
    }
    case "fixedAssetPatch": {
      const request = body as EndpointRequest<"fixedAssetPatch">;
      return {
        fixedAsset: await backendApi.fixedAssets.patch(
          request.fiscalPeriodId,
          request.id,
          request.input,
        ),
      };
    }
    case "fixedAssetRemove": {
      const request = body as EndpointRequest<"fixedAssetRemove">;
      await backendApi.fixedAssets.remove(request.fiscalPeriodId, request.id);
      return null;
    }
    case "masterBookAccounts":
      return {
        bookAccounts: await backendApi.masterData.getBookAccounts(),
      };
    case "masterTaxCategories":
      return {
        taxCategories: await backendApi.masterData.getTaxCategories(),
      };
    case "masterBusinessCategories":
      return {
        businessCategories: await backendApi.masterData.getBusinessCategories(),
      };
    case "maintenanceGet":
      return EMBEDDED_MAINTENANCE_STATUS;
    default: {
      const unsupported: never = key;
      throw new Error(`unsupported endpoint: ${String(unsupported)}`);
    }
  }
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function backendErrorToEmbeddedHttpResponse(
  error: unknown,
): OpenkkHttpResponse {
  if (isOpenkkApiErrorDto(error)) {
    const status = isHttpErrorStatus(error.statusCode) ? error.statusCode : 500;
    return {
      status,
      body: {
        messageForDeveloper: error.messageForDeveloper,
        messageForUser: error.messageForUser,
        originalMessage: error.originalMessage,
        statusCode: status,
        code: error.code,
      } satisfies OpenkkApiErrorDto,
    };
  }
  return {
    status: 500,
    body: null,
  };
}

function isHttpErrorStatus(status: number | null): status is number {
  return status != null && status >= 400 && status <= 599;
}
