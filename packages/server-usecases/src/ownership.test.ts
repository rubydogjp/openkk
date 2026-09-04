import { describe, expect, it, vi } from "vitest";

import type { OpenkkDbPort } from "@rubydogjp/openkk-server-ports";
import { createServerUsecases } from "./usecases.js";

describe("server usecase ownership boundary", () => {
  it("hides entries and fixed assets owned by another user", async () => {
    const db = {
      entries: {
        getById: vi.fn(async () => ({ userId: "user-2" })),
      },
      fixedAssets: {
        getById: vi.fn(async () => ({ userId: "user-2" })),
      },
    } as unknown as OpenkkDbPort;
    const usecases = createServerUsecases(db);

    await expect(usecases.entries.getById("user-1", "entry-1")).resolves.toBeNull();
    await expect(
      usecases.fixedAssets.getById("user-1", "asset-1"),
    ).resolves.toBeNull();
  });

  it("rejects cross-user child mutations before calling the db mutation", async () => {
    const updateEntry = vi.fn();
    const deleteAsset = vi.fn();
    const db = {
      entries: {
        getById: vi.fn(async () => ({ userId: "user-2" })),
        update: updateEntry,
      },
      fixedAssets: {
        getById: vi.fn(async () => ({ userId: "user-2" })),
        delete: deleteAsset,
      },
    } as unknown as OpenkkDbPort;
    const usecases = createServerUsecases(db);

    await expect(
      usecases.entries.update("user-1", "entry-1", {} as never),
    ).rejects.toThrow(/entry not found/);
    await expect(
      usecases.fixedAssets.delete("user-1", "asset-1"),
    ).rejects.toThrow(/fixed asset not found/);
    expect(updateEntry).not.toHaveBeenCalled();
    expect(deleteAsset).not.toHaveBeenCalled();
  });

  it("rejects creating child records in another user's fiscal period", async () => {
    const createEntry = vi.fn();
    const importEntries = vi.fn();
    const createAsset = vi.fn();
    const db = {
      fiscalPeriods: {
        getById: vi.fn(async () => ({ id: "fp-1", userId: "user-2" })),
      },
      entries: {
        create: createEntry,
        importMany: importEntries,
      },
      fixedAssets: { create: createAsset },
    } as unknown as OpenkkDbPort;
    const usecases = createServerUsecases(db);

    await expect(
      usecases.entries.create("user-1", "fp-1", {} as never),
    ).rejects.toThrow(/fiscal period not found/);
    await expect(
      usecases.entries.importMany("user-1", "fp-1", []),
    ).rejects.toThrow(/fiscal period not found/);
    await expect(
      usecases.fixedAssets.create("user-1", "fp-1", {} as never),
    ).rejects.toThrow(/fiscal period not found/);
    expect(createEntry).not.toHaveBeenCalled();
    expect(importEntries).not.toHaveBeenCalled();
    expect(createAsset).not.toHaveBeenCalled();
  });

  it("rejects cross-user fiscal-period and closing operations before mutation", async () => {
    const archive = vi.fn();
    const runClosing = vi.fn();
    const db = {
      fiscalPeriods: {
        getById: vi.fn(async () => ({ id: "fp-1", userId: "user-2" })),
        getAllByUser: vi.fn(async () => []),
        archive,
      },
      closings: { run: runClosing },
    } as unknown as OpenkkDbPort;
    const usecases = createServerUsecases(db);

    await expect(
      usecases.fiscalPeriod.archive("user-1", "fp-1"),
    ).rejects.toThrow(/fiscal period not found/);
    await expect(
      usecases.closing.run("user-1", "fp-1", 2026, []),
    ).rejects.toThrow(/fiscal period not found/);
    expect(archive).not.toHaveBeenCalled();
    expect(runClosing).not.toHaveBeenCalled();
  });
});
