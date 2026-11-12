import { describe, expect, it } from "vitest";

import { createOpenkkBackendApi } from "@rubydogjp/openkk-backend-api";
import { createBookDbAdapter } from "@rubydogjp/openkk-book-db-adapter";
import {
  OpenkkBookFileError,
  type OpenkkBackendPort,
} from "@rubydogjp/openkk-driver";
import { createOpenkkEmbeddedBackendAdapter } from "@rubydogjp/openkk-embedded-backend-adapter";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { createRecordsBookFilesAdapter } from "./index.js";

const BOOK_OWNER = "openkk-original-user";

async function emptyBackend(userId: string): Promise<OpenkkBackendPort> {
  return createOpenkkEmbeddedBackendAdapter(
    createOpenkkBackendApi(await createMemoryDbAdapter(null), { userId }),
  );
}

async function backendWithPeriod(userId: string) {
  const backend = await emptyBackend(userId);
  const created = await backend.fiscalPeriods.create({
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  await backend.fiscalPeriods.start(created.id);
  await backend.fiscalPeriods.patch(created.id, {
    openingBalancesCompleted: true,
  });
  await backend.entries.create(created.id, {
    date: "2026-03-01",
    description: "売上",
    localId: null,
    businessRate: 1,
    lines: [
      {
        side: "debit",
        bookAccountId: "acct_cash",
        amount: 1200,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
      {
        side: "credit",
        bookAccountId: "acct_sales",
        amount: 1200,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
    ],
  });
  await backend.fixedAssets.create(created.id, {
    name: "ノートパソコン",
    acquisitionDate: "2026-01-10",
    acquisitionCost: 240000,
    usefulLife: 4,
    depreciationMethod: "straight_line",
    businessRate: 1,
    bookAccountId: "acct_equipment",
  });
  return { backend, fiscalPeriodId: created.id };
}

function adapterFor(backend: OpenkkBackendPort) {
  const delivered: Array<{ bytes: Uint8Array; fileName: string }> = [];
  const bookFiles = createRecordsBookFilesAdapter({
    backend,
    bookOwnerUserId: BOOK_OWNER,
    now: () => new Date("2026-12-31T12:00:00.000Z"),
    fileNameOf: (name) => `${name}.openkk`,
    deliver: async (bytes, fileName) => {
      delivered.push({ bytes, fileName });
      return "saved";
    },
  });
  return { bookFiles, delivered };
}

describe("createRecordsBookFilesAdapter", () => {
  it("does not track saves", async () => {
    const { bookFiles } = adapterFor(await emptyBackend("cloud-user"));

    expect(bookFiles.saveTracking).toBeNull();
    expect(bookFiles.fileNameOf("2026年分")).toBe("2026年分.openkk");
  });

  it("saves a period as a book that keeps its id and belongs to the book owner", async () => {
    const { backend, fiscalPeriodId } = await backendWithPeriod("cloud-user");
    const { bookFiles, delivered } = adapterFor(backend);

    expect(await bookFiles.save(fiscalPeriodId)).toBe("saved");

    expect(delivered.map((file) => file.fileName)).toEqual(["2026年分.openkk"]);
    const book = await createBookDbAdapter(delivered[0]!.bytes);
    try {
      expect(book.listFiscalPeriodIds()).toEqual([fiscalPeriodId]);
      const [period] = await book.db.fiscalPeriods.getAll(BOOK_OWNER);
      expect(period?.name).toBe("2026年分");
      expect(period?.phase).toBe("journalizing");
      const entries = await book.db.entries.getAll(fiscalPeriodId);
      expect(entries.map((entry) => entry.description)).toEqual(["売上"]);
      expect(entries[0]?.lines.map((line) => line.amount)).toEqual([
        1200, 1200,
      ]);
      const assets = await book.db.fixedAssets.getAll(fiscalPeriodId);
      expect(assets.map((asset) => asset.name)).toEqual(["ノートパソコン"]);
      expect(book.lastChangedAt()).toBeGreaterThan(0);
    } finally {
      book.close();
    }
  });

  it("imports a saved book into another backend as a new period", async () => {
    const source = await backendWithPeriod("cloud-user");
    const saved = adapterFor(source.backend);
    await saved.bookFiles.save(source.fiscalPeriodId);
    const target = await emptyBackend("another-user");
    const { bookFiles } = adapterFor(target);

    const plan = await bookFiles.inspect(saved.delivered[0]!.bytes);
    expect(plan.items.map((item) => item.case)).toEqual(["new"]);
    const [importedId] = await plan.apply();

    const [period] = await target.fiscalPeriods.getAll();
    expect(period?.id).toBe(importedId);
    expect(period?.name).toBe("2026年分");
    expect(period?.archiveStatus).toBe("active");
    expect(await target.entries.getAll(importedId!)).toHaveLength(1);
    expect(await target.fixedAssets.getAll(importedId!)).toHaveLength(1);
  });

  it("refuses a book whose dates overlap an existing period", async () => {
    const source = await backendWithPeriod("cloud-user");
    const { bookFiles, delivered } = adapterFor(source.backend);
    await bookFiles.save(source.fiscalPeriodId);

    const plan = await bookFiles.inspect(delivered[0]!.bytes);

    expect(plan.items).toEqual([
      {
        fiscalPeriodId: source.fiscalPeriodId,
        fiscalPeriodName: "2026年分",
        case: "overlapping",
        existingFiscalPeriodId: source.fiscalPeriodId,
        existingFiscalPeriodName: "2026年分",
      },
    ]);
    await expect(plan.apply()).rejects.toBeInstanceOf(OpenkkBookFileError);
    expect(await source.backend.fiscalPeriods.getAll()).toHaveLength(1);
  });

  it("reports a file that is not a book", async () => {
    const { bookFiles } = adapterFor(await emptyBackend("cloud-user"));

    await expect(
      bookFiles.inspect(new TextEncoder().encode("not a book")),
    ).rejects.toMatchObject({ problem: "not_a_book" });
  });
});
