import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
  OpenkkNextBookInput,
  OpenkkOtherBookPeriod,
  OpenkkOtherBookRecords,
} from "@rubydogjp/openkk-client";
import {
  createDocumentDbAdapter,
  type DocumentDbAdapter,
} from "@rubydogjp/openkk-document-db-adapter";
import { createOpenkkEmbeddedBackend } from "@rubydogjp/openkk-embedded-backend";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";

import { BOOK_OWNER_USER_ID } from "./openkk-config";

export function createBookBackend(
  db: DocumentDbAdapter["db"],
): OpenkkBackendPort {
  return createOpenkkEmbeddedBackendAdapter(
    createOpenkkEmbeddedBackend(db, { userId: BOOK_OWNER_USER_ID }),
  );
}

export async function findLatestFiscalPeriod(
  backend: OpenkkBackendPort,
): Promise<FiscalPeriodApiRecord | null> {
  return (
    await backend.fiscalPeriods.getAll()
  ).reduce<FiscalPeriodApiRecord | null>(
    (latest, period) =>
      latest == null || period.startDate > latest.startDate ? period : latest,
    null,
  );
}

export async function bookHasFiscalPeriods(
  bytes: Uint8Array,
): Promise<boolean> {
  const adapter = await createDocumentDbAdapter(bytes);
  try {
    return (
      (await findLatestFiscalPeriod(createBookBackend(adapter.db))) != null
    );
  } finally {
    adapter.close();
  }
}

export async function buildNextBookBytes(
  input: OpenkkNextBookInput,
): Promise<Uint8Array> {
  const adapter = await createDocumentDbAdapter(null);
  try {
    const backend = createBookBackend(adapter.db);
    const created = await backend.fiscalPeriods.create(input.fiscalPeriod);
    await backend.fiscalPeriods.applyCarryoverFromArchive(
      created.id,
      input.carryover,
    );
    return adapter.exportBytes();
  } finally {
    adapter.close();
  }
}

export async function readBookPeriods(
  bookName: string,
  bytes: Uint8Array,
): Promise<OpenkkOtherBookPeriod[]> {
  const adapter = await createDocumentDbAdapter(bytes);
  try {
    const periods = await createBookBackend(adapter.db).fiscalPeriods.getAll();
    return periods.map((fiscalPeriod) => ({
      bookName,
      fiscalPeriod,
      readRecords: () => readBookRecords(bytes, fiscalPeriod.id),
    }));
  } finally {
    adapter.close();
  }
}

async function readBookRecords(
  bytes: Uint8Array,
  fiscalPeriodId: string,
): Promise<OpenkkOtherBookRecords> {
  const adapter = await createDocumentDbAdapter(bytes);
  try {
    const backend = createBookBackend(adapter.db);
    const [entries, fixedAssets] = await Promise.all([
      backend.entries.getAll(fiscalPeriodId),
      backend.fixedAssets.getAll(fiscalPeriodId),
    ]);
    return { entries, fixedAssets };
  } finally {
    adapter.close();
  }
}
