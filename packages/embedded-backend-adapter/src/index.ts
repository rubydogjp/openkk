import {
  isOpenkkApiErrorDto,
  OPENKK_HTTP_ENDPOINTS,
  resolveOpenkkHttpResponse,
  type OpenkkApiErrorDto,
  type OpenkkBackendPort,
  type OpenkkHttpEndpointKey,
  type OpenkkHttpEndpointSpecs,
  type OpenkkHttpResponse,
} from "@rubydogjp/openkk-client-ports";
import type { OpenkkServerPort } from "@rubydogjp/openkk-embedded-backend";

type EndpointRequest<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["request"];

type EndpointResponse<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["response"];

export function createOpenkkEmbeddedBackendAdapter(
  server: OpenkkServerPort,
): OpenkkBackendPort {
  const request = async <Key extends OpenkkHttpEndpointKey>(
    key: Key,
    body: EndpointRequest<Key>,
  ): Promise<EndpointResponse<Key>> => {
    const response = await dispatchEmbeddedHttp(
      server,
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
      archive: async (id) => {
        const response = await request("fiscalPeriodArchive", { id });
        return response.fiscalPeriod;
      },
      purgeArchivedData: async (id) => {
        const response = await request("fiscalPeriodPurgeArchivedData", { id });
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
  server: OpenkkServerPort,
  key: OpenkkHttpEndpointKey,
  body: unknown,
): Promise<OpenkkHttpResponse> {
  try {
    return {
      status: OPENKK_HTTP_ENDPOINTS[key].successStatus,
      body: await embeddedResponseBody(server, key, body),
    };
  } catch (error) {
    return serverErrorToEmbeddedHttpResponse(error);
  }
}

async function embeddedResponseBody(
  server: OpenkkServerPort,
  key: OpenkkHttpEndpointKey,
  body: unknown,
): Promise<unknown> {
  switch (key) {
    case "authStartSession": {
      const request = body as EndpointRequest<"authStartSession">;
      return await server.auth.startSession(request.redirectUrl);
    }
    case "authCompleteSession": {
      const request = body as EndpointRequest<"authCompleteSession">;
      return await server.auth.completeSession(request.state, request.code);
    }
    case "authRedeemCompletionCode": {
      const request = body as EndpointRequest<"authRedeemCompletionCode">;
      return await server.auth.redeemCompletionCode(request.completionCode);
    }
    case "authSignOut":
      await server.auth.signOut();
      return null;
    case "preClosingRun": {
      const request = body as EndpointRequest<"preClosingRun">;
      return {
        fiscalPeriod: await server.preClosings.run(request.fiscalPeriodId),
      };
    }
    case "preClosingCancel": {
      const request = body as EndpointRequest<"preClosingCancel">;
      return {
        fiscalPeriod: await server.preClosings.cancel(request.fiscalPeriodId),
      };
    }
    case "closingRun": {
      const request = body as EndpointRequest<"closingRun">;
      return {
        fiscalPeriod: await server.closings.run(
          request.fiscalPeriodId,
          request.entries,
        ),
      };
    }
    case "entriesGetAll": {
      const request = body as EndpointRequest<"entriesGetAll">;
      return {
        entries: await server.entries.getAll(request.fiscalPeriodId),
      };
    }
    case "entryCreate": {
      const request = body as EndpointRequest<"entryCreate">;
      return {
        entry: await server.entries.create(
          request.fiscalPeriodId,
          request.input,
        ),
      };
    }
    case "entryUpdate": {
      const request = body as EndpointRequest<"entryUpdate">;
      return {
        entry: await server.entries.update(
          request.fiscalPeriodId,
          request.id,
          request.input,
        ),
      };
    }
    case "entryRemove": {
      const request = body as EndpointRequest<"entryRemove">;
      await server.entries.remove(request.fiscalPeriodId, request.id);
      return null;
    }
    case "entryImportMany": {
      const request = body as EndpointRequest<"entryImportMany">;
      return await server.entries.importMany(
        request.fiscalPeriodId,
        request.entries,
      );
    }
    case "fiscalPeriodsGetAll":
      return { fiscalPeriods: await server.fiscalPeriods.getAll() };
    case "fiscalPeriodCreate": {
      const request = body as EndpointRequest<"fiscalPeriodCreate">;
      return {
        fiscalPeriod: await server.fiscalPeriods.create(request.input),
      };
    }
    case "fiscalPeriodNextCreate": {
      const request = body as EndpointRequest<"fiscalPeriodNextCreate">;
      return {
        fiscalPeriod: await server.fiscalPeriods.createNext(request.input),
      };
    }
    case "fiscalPeriodImportArchived": {
      const request = body as EndpointRequest<"fiscalPeriodImportArchived">;
      return {
        fiscalPeriod: await server.fiscalPeriods.importArchived(request.input),
      };
    }
    case "fiscalPeriodPatch": {
      const request = body as EndpointRequest<"fiscalPeriodPatch">;
      return {
        fiscalPeriod: await server.fiscalPeriods.patch(
          request.id,
          request.input,
        ),
      };
    }
    case "fiscalPeriodStart": {
      const request = body as EndpointRequest<"fiscalPeriodStart">;
      return { fiscalPeriod: await server.fiscalPeriods.start(request.id) };
    }
    case "fiscalPeriodArchive": {
      const request = body as EndpointRequest<"fiscalPeriodArchive">;
      return { fiscalPeriod: await server.fiscalPeriods.archive(request.id) };
    }
    case "fiscalPeriodPurgeArchivedData": {
      const request = body as EndpointRequest<"fiscalPeriodPurgeArchivedData">;
      return {
        fiscalPeriod: await server.fiscalPeriods.purgeArchivedData(request.id),
      };
    }
    case "fiscalPeriodRemove": {
      const request = body as EndpointRequest<"fiscalPeriodRemove">;
      await server.fiscalPeriods.remove(request.id);
      return null;
    }
    case "fixedAssetsGetAll": {
      const request = body as EndpointRequest<"fixedAssetsGetAll">;
      return {
        fixedAssets: await server.fixedAssets.getAll(request.fiscalPeriodId),
      };
    }
    case "fixedAssetCreate": {
      const request = body as EndpointRequest<"fixedAssetCreate">;
      return {
        fixedAsset: await server.fixedAssets.create(
          request.fiscalPeriodId,
          request.input,
        ),
      };
    }
    case "fixedAssetPatch": {
      const request = body as EndpointRequest<"fixedAssetPatch">;
      return {
        fixedAsset: await server.fixedAssets.patch(
          request.fiscalPeriodId,
          request.id,
          request.input,
        ),
      };
    }
    case "fixedAssetRemove": {
      const request = body as EndpointRequest<"fixedAssetRemove">;
      await server.fixedAssets.remove(request.fiscalPeriodId, request.id);
      return null;
    }
    case "masterBookAccounts":
      return {
        bookAccounts: await server.masterData.getBookAccounts(),
      };
    case "masterTaxCategories":
      return {
        taxCategories: await server.masterData.getTaxCategories(),
      };
    case "masterBusinessCategories":
      return {
        businessCategories: await server.masterData.getBusinessCategories(),
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

function serverErrorToEmbeddedHttpResponse(error: unknown): OpenkkHttpResponse {
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
