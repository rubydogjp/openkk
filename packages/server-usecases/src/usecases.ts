import type {
  EntryUpsertInput,
  FiscalPeriodArchiveImportInput,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";
import { normalizeArchiveImportInput } from "./archive-import";

export type ServerUsecases = ReturnType<typeof createServerUsecases>;

export function createServerUsecases(db: OpenkkDbPort) {
  return {
    auth: createAuthUsecase(),
    closing: createClosingUsecase(db),
    entries: createEntriesUsecase(db),
    fiscalPeriod: createFiscalPeriodUsecase(db),
    fixedAssets: createFixedAssetsUsecase(db),
    masterData: createMasterDataUsecase(db),
  };
}

const LOCAL_AUTH_COMPLETION_PREFIX = "local-auth-completion:";

function createAuthUsecase() {
  return {
    async startSession(redirectUrl: string) {
      const target = new URL(redirectUrl);
      const state = crypto.randomUUID();
      const code = crypto.randomUUID();
      target.searchParams.set("state", state);
      target.searchParams.set("code", code);
      return { authUrl: target.toString() };
    },
    async completeSession(state: string, code: string) {
      if (state.trim() === "" || code.trim() === "") {
        throw new Error("auth state and code are required");
      }
      return {
        completionCode: `${LOCAL_AUTH_COMPLETION_PREFIX}${encodeURIComponent(
          state,
        )}:${encodeURIComponent(code)}`,
      };
    },
    async redeemCompletionCode(completionCode: string) {
      if (!completionCode.startsWith(LOCAL_AUTH_COMPLETION_PREFIX)) {
        throw new Error("invalid auth completion code");
      }
      return { userId: "local-auth-user" };
    },
    async signOut() {},
  };
}

function createClosingUsecase(db: OpenkkDbPort) {
  return {
    async get(_userId: string, fiscalPeriodId: string, year: number) {
      return db.closings.get(fiscalPeriodId, year);
    },
    async run(
      _userId: string,
      fiscalPeriodId: string,
      year: number,
      isProvisional: boolean,
    ) {
      await db.closings.upsert(fiscalPeriodId, year, isProvisional);
    },
    async cancel(_userId: string, fiscalPeriodId: string, year: number) {
      await db.closings.delete(fiscalPeriodId, year);
    },
  };
}

function createEntriesUsecase(db: OpenkkDbPort) {
  return {
    async getAll(_userId: string, fiscalPeriodId: string) {
      return db.entries.getAll(fiscalPeriodId);
    },
    async getById(_userId: string, id: string) {
      return db.entries.getById(id);
    },
    async getByMonth(
      _userId: string,
      fiscalPeriodId: string,
      yearMonth: string,
    ) {
      return db.entries.getByMonth(fiscalPeriodId, yearMonth);
    },
    async create(
      userId: string,
      fiscalPeriodId: string,
      input: EntryUpsertInput,
    ) {
      return db.entries.create(userId, fiscalPeriodId, input);
    },
    async update(_userId: string, id: string, input: EntryUpsertInput) {
      return db.entries.update(id, input);
    },
    async delete(_userId: string, id: string) {
      await db.entries.delete(id);
    },
    async importMany(
      userId: string,
      fiscalPeriodId: string,
      entries: EntryUpsertInput[],
    ) {
      return db.entries.importMany(userId, fiscalPeriodId, entries);
    },
  };
}

function createFiscalPeriodUsecase(db: OpenkkDbPort) {
  return {
    async getAll(userId: string) {
      return db.fiscalPeriods.getAllByUser(userId);
    },
    async create(userId: string, input: FiscalPeriodCreateInput) {
      return db.fiscalPeriods.create(userId, input);
    },
    async importArchived(userId: string, input: FiscalPeriodArchiveImportInput) {
      return db.fiscalPeriods.importArchived(
        userId,
        normalizeArchiveImportInput(input, userId),
      );
    },
    async update(_userId: string, id: string, patch: FiscalPeriodPatchInput) {
      return db.fiscalPeriods.update(id, patch);
    },
    async delete(_userId: string, id: string) {
      await db.fiscalPeriods.delete(id);
    },
  };
}

function createFixedAssetsUsecase(db: OpenkkDbPort) {
  return {
    async getAll(_userId: string, fiscalPeriodId: string) {
      return db.fixedAssets.getAllByFiscalPeriod(fiscalPeriodId);
    },
    async getById(_userId: string, id: string) {
      return db.fixedAssets.getById(id);
    },
    async create(
      userId: string,
      fiscalPeriodId: string,
      input: FixedAssetCreateInput,
    ) {
      return db.fixedAssets.create(userId, fiscalPeriodId, input);
    },
    async update(_userId: string, id: string, patch: FixedAssetPatchInput) {
      return db.fixedAssets.update(id, patch);
    },
    async delete(_userId: string, id: string) {
      await db.fixedAssets.delete(id);
    },
  };
}

function createMasterDataUsecase(db: OpenkkDbPort) {
  return {
    async getBookAccounts() {
      return db.masterData.getAllBookAccounts();
    },
    async getTaxCategories() {
      return db.masterData.getAllTaxCategories();
    },
    async getBusinessCategories() {
      return db.masterData.getAllBusinessCategories();
    },
  };
}
