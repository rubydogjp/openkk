import {
  OPENKK_HTTP_ENDPOINTS,
  type OpenkkApiErrorDto,
  type OpenkkBackendPort,
  type OpenkkHttpEndpointKey,
  type OpenkkHttpEndpointSpecs,
} from "@rubydogjp/openkk-client-ports";
import type { OpenkkServerPort } from "@rubydogjp/openkk-embedded-backend";

type EndpointRequest<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["request"];

type EndpointResponse<Key extends OpenkkHttpEndpointKey> =
  OpenkkHttpEndpointSpecs[Key]["response"];

type EmbeddedHttpResponse = {
  status: number;
  body: unknown;
};

export function createOpenkkEmbeddedBackendAdapter(
  server: OpenkkServerPort,
): OpenkkBackendPort {
  const request = async <Key extends OpenkkHttpEndpointKey>(
    key: Key,
    body: EndpointRequest<Key>,
  ): Promise<EndpointResponse<Key>> => {
    const endpoint = OPENKK_HTTP_ENDPOINTS[key];
    const response = await dispatchEmbeddedHttp(
      server,
      key,
      jsonRoundTrip(body),
    );
    if (response.status !== endpoint.successStatus) {
      throw jsonRoundTrip({
        messageForDeveloper: `embedded backend returned unexpected status for ${key}: ${response.status}`,
        messageForUser: "バックエンド処理でエラーが発生しました",
        originalMessage: null,
        statusCode: response.status,
      } satisfies OpenkkApiErrorDto);
    }
    return jsonRoundTrip(response.body) as EndpointResponse<Key>;
  };

  return {
    auth: {
      startSession: async (redirectUrl) =>
        request("authStartSession", { redirectUrl }),
      completeSession: async (input) =>
        request("authCompleteSession", input),
      redeemCompletionCode: async (completionCode) =>
        request("authRedeemCompletionCode", { completionCode }),
      signOut: async () => {
        await request("authSignOut", {});
      },
    },
    closing: {
      get: async (fiscalPeriodId, year) => {
        const response = await request("closingGet", { fiscalPeriodId, year });
        return response.closing;
      },
      run: async (input) => {
        await request("closingRun", input);
      },
      cancel: async (fiscalPeriodId, year) => {
        await request("closingCancel", { fiscalPeriodId, year });
      },
    },
    entries: {
      getAll: async (fiscalPeriodId) => {
        const response = await request("entriesGetAll", { fiscalPeriodId });
        return response.entries;
      },
      create: async (fiscalPeriodId, input) => {
        const response = await request("entryCreate", { fiscalPeriodId, input });
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
      delete: async (fiscalPeriodId, id) => {
        await request("fixedAssetDelete", { fiscalPeriodId, id });
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
): Promise<EmbeddedHttpResponse> {
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
          body: await server.auth.redeemCompletionCode(
            request.completionCode,
          ),
        };
      }
      case "authSignOut":
        await server.auth.signOut();
        return { status: 204, body: undefined };
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
        await server.closing.run(request);
        return { status: 204, body: undefined };
      }
      case "closingCancel": {
        const request = body as EndpointRequest<"closingCancel">;
        await server.closing.cancel(request.fiscalPeriodId, request.year);
        return { status: 204, body: undefined };
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
      case "fixedAssetDelete": {
        const request = body as EndpointRequest<"fixedAssetDelete">;
        await server.fixedAssets.delete(request.fiscalPeriodId, request.id);
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
            businessCategories:
              await server.masterData.getBusinessCategories(),
          },
        };
    }
  } catch (error) {
    throw jsonRoundTrip(errorToApiErrorDto(error));
  }
}

function jsonRoundTrip<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorToApiErrorDto(error: unknown): OpenkkApiErrorDto {
  if (isApiErrorDto(error)) {
    return {
      messageForDeveloper: error.messageForDeveloper,
      messageForUser: error.messageForUser,
      originalMessage: error.originalMessage,
      statusCode: error.statusCode,
    };
  }
  return {
    messageForDeveloper: "embedded backend request failed",
    messageForUser: "バックエンド処理でエラーが発生しました",
    originalMessage:
      error instanceof Error ? error.message : stringifyUnknown(error),
    statusCode: null,
  };
}

function isApiErrorDto(value: unknown): value is OpenkkApiErrorDto {
  if (typeof value !== "object" || value == null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.messageForDeveloper === "string" &&
    typeof candidate.messageForUser === "string" &&
    (typeof candidate.originalMessage === "string" ||
      candidate.originalMessage === null) &&
    (typeof candidate.statusCode === "number" ||
      candidate.statusCode === null)
  );
}

function stringifyUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.length === 0 ? null : value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
