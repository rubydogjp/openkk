import {
  isOpenkkApiErrorDto,
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
      completeSession: async (input) => request("authCompleteSession", input),
      redeemCompletionCode: async (completionCode) =>
        request("authRedeemCompletionCode", { completionCode }),
      signOut: async () => {
        await request("authSignOut", {});
      },
    },
    preClosing: {
      get: async (fiscalPeriodId, year) => {
        const response = await request("preClosingGet", {
          fiscalPeriodId,
          year,
        });
        return response.preClosing;
      },
      run: async (input) => {
        const response = await request("preClosingRun", input);
        return response.fiscalPeriod;
      },
      cancel: async (fiscalPeriodId, year) => {
        const response = await request("preClosingCancel", {
          fiscalPeriodId,
          year,
        });
        return response.fiscalPeriod;
      },
    },
    closing: {
      get: async (fiscalPeriodId, year) => {
        const response = await request("closingGet", { fiscalPeriodId, year });
        return response.closing;
      },
      run: async (input) => {
        const response = await request("closingRun", input);
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
      patch: async (fiscalPeriodId, id, input) => {
        const response = await request("entryPatch", {
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
    fiscalPeriod: {
      getAll: async () => {
        const response = await request("fiscalPeriodsGetAll", {});
        return response.fiscalPeriods;
      },
      create: async (input) => {
        const response = await request("fiscalPeriodCreate", { input });
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
      archive: async (id) => {
        const response = await request("fiscalPeriodArchive", { id });
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
  };
}

async function dispatchEmbeddedHttp(
  server: OpenkkServerPort,
  key: OpenkkHttpEndpointKey,
  body: unknown,
): Promise<OpenkkHttpResponse> {
  try {
    switch (key) {
      case "authStartSession": {
        const request = body as EndpointRequest<"authStartSession">;
        return {
          status: 200,
          body: await server.auth.startSession(request.redirectUrl),
        };
      }
      case "authCompleteSession": {
        const request = body as EndpointRequest<"authCompleteSession">;
        return {
          status: 200,
          body: await server.auth.completeSession(request),
        };
      }
      case "authRedeemCompletionCode": {
        const request = body as EndpointRequest<"authRedeemCompletionCode">;
        return {
          status: 200,
          body: await server.auth.redeemCompletionCode(request.completionCode),
        };
      }
      case "authSignOut":
        await server.auth.signOut();
        return { status: 204, body: undefined };
      case "preClosingGet": {
        const request = body as EndpointRequest<"preClosingGet">;
        return {
          status: 200,
          body: {
            preClosing: await server.preClosing.get(
              request.fiscalPeriodId,
              request.year,
            ),
          },
        };
      }
      case "preClosingRun": {
        const request = body as EndpointRequest<"preClosingRun">;
        return {
          status: 200,
          body: { fiscalPeriod: await server.preClosing.run(request) },
        };
      }
      case "preClosingCancel": {
        const request = body as EndpointRequest<"preClosingCancel">;
        return {
          status: 200,
          body: {
            fiscalPeriod: await server.preClosing.cancel(
              request.fiscalPeriodId,
              request.year,
            ),
          },
        };
      }
      case "closingGet": {
        const request = body as EndpointRequest<"closingGet">;
        return {
          status: 200,
          body: {
            closing: await server.closing.get(
              request.fiscalPeriodId,
              request.year,
            ),
          },
        };
      }
      case "closingRun": {
        const request = body as EndpointRequest<"closingRun">;
        return {
          status: 200,
          body: { fiscalPeriod: await server.closing.run(request) },
        };
      }
      case "entriesGetAll": {
        const request = body as EndpointRequest<"entriesGetAll">;
        return {
          status: 200,
          body: {
            entries: await server.entries.getAll(request.fiscalPeriodId),
          },
        };
      }
      case "entryCreate": {
        const request = body as EndpointRequest<"entryCreate">;
        return {
          status: 201,
          body: {
            entry: await server.entries.create(
              request.fiscalPeriodId,
              request.input,
            ),
          },
        };
      }
      case "entryPatch": {
        const request = body as EndpointRequest<"entryPatch">;
        return {
          status: 200,
          body: {
            entry: await server.entries.patch(
              request.fiscalPeriodId,
              request.id,
              request.input,
            ),
          },
        };
      }
      case "entryRemove": {
        const request = body as EndpointRequest<"entryRemove">;
        await server.entries.remove(request.fiscalPeriodId, request.id);
        return { status: 204, body: undefined };
      }
      case "entryImportMany": {
        const request = body as EndpointRequest<"entryImportMany">;
        return {
          status: 200,
          body: await server.entries.importMany(
            request.fiscalPeriodId,
            request.entries,
          ),
        };
      }
      case "fiscalPeriodsGetAll":
        return {
          status: 200,
          body: { fiscalPeriods: await server.fiscalPeriod.getAll() },
        };
      case "fiscalPeriodCreate": {
        const request = body as EndpointRequest<"fiscalPeriodCreate">;
        return {
          status: 201,
          body: {
            fiscalPeriod: await server.fiscalPeriod.create(request.input),
          },
        };
      }
      case "fiscalPeriodImportArchived": {
        const request = body as EndpointRequest<"fiscalPeriodImportArchived">;
        return {
          status: 201,
          body: {
            fiscalPeriod: await server.fiscalPeriod.importArchived(
              request.input,
            ),
          },
        };
      }
      case "fiscalPeriodPatch": {
        const request = body as EndpointRequest<"fiscalPeriodPatch">;
        return {
          status: 200,
          body: {
            fiscalPeriod: await server.fiscalPeriod.patch(
              request.id,
              request.input,
            ),
          },
        };
      }
      case "fiscalPeriodArchive": {
        const request = body as EndpointRequest<"fiscalPeriodArchive">;
        return {
          status: 200,
          body: { fiscalPeriod: await server.fiscalPeriod.archive(request.id) },
        };
      }
      case "fiscalPeriodRemove": {
        const request = body as EndpointRequest<"fiscalPeriodRemove">;
        await server.fiscalPeriod.remove(request.id);
        return { status: 204, body: undefined };
      }
      case "fixedAssetsGetAll": {
        const request = body as EndpointRequest<"fixedAssetsGetAll">;
        return {
          status: 200,
          body: {
            fixedAssets: await server.fixedAssets.getAll(
              request.fiscalPeriodId,
            ),
          },
        };
      }
      case "fixedAssetCreate": {
        const request = body as EndpointRequest<"fixedAssetCreate">;
        return {
          status: 201,
          body: {
            fixedAsset: await server.fixedAssets.create(
              request.fiscalPeriodId,
              request.input,
            ),
          },
        };
      }
      case "fixedAssetPatch": {
        const request = body as EndpointRequest<"fixedAssetPatch">;
        return {
          status: 200,
          body: {
            fixedAsset: await server.fixedAssets.patch(
              request.fiscalPeriodId,
              request.id,
              request.input,
            ),
          },
        };
      }
      case "fixedAssetRemove": {
        const request = body as EndpointRequest<"fixedAssetRemove">;
        await server.fixedAssets.remove(request.fiscalPeriodId, request.id);
        return { status: 204, body: undefined };
      }
      case "masterBookAccounts":
        return {
          status: 200,
          body: {
            bookAccounts: await server.masterData.getBookAccounts(),
          },
        };
      case "masterTaxCategories":
        return {
          status: 200,
          body: {
            taxCategories: await server.masterData.getTaxCategories(),
          },
        };
      case "masterBusinessCategories":
        return {
          status: 200,
          body: {
            businessCategories: await server.masterData.getBusinessCategories(),
          },
        };
      default: {
        const unsupported: never = key;
        throw new Error(`unsupported endpoint: ${String(unsupported)}`);
      }
    }
  } catch (error) {
    return serverErrorToEmbeddedHttpResponse(error);
  }
}

function jsonRoundTrip<T>(value: T): T {
  if (value === undefined) return value;
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
      } satisfies OpenkkApiErrorDto,
    };
  }
  return {
    status: 500,
    body: undefined,
  };
}

function isHttpErrorStatus(status: number | null): status is number {
  return status != null && status >= 400 && status <= 599;
}
