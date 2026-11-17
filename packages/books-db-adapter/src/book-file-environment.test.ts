import { afterEach, describe, expect, it, vi } from "vitest";

import type * as BookDbAdapterModule from "@rubydogjp/openkk-book-db-adapter";

import { closeTestBooks, seededBookBytes } from "../test-support/books.js";

const failure = vi.hoisted(() => ({ onOpen: 0, opened: 0 }));

vi.mock("@rubydogjp/openkk-book-db-adapter", async (importOriginal) => {
  const original = await importOriginal<typeof BookDbAdapterModule>();
  return {
    ...original,
    createBookDbAdapter: async (bytes: Uint8Array | null) => {
      failure.opened += 1;
      if (failure.opened === failure.onOpen) {
        const error = new Error("Allocation failed");
        error.name = "WasmAllocError";
        throw error;
      }
      return original.createBookDbAdapter(bytes);
    },
  };
});

const { splitReadableBookFilePeriods } = await import("./book-file.js");

afterEach(() => {
  closeTestBooks();
  failure.onOpen = 0;
  failure.opened = 0;
  vi.restoreAllMocks();
});

function seedPeriod(id: string, year: number) {
  return {
    id,
    userId: "user-1",
    name: `${year}年分`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    phase: "journalizing" as const,
    archiveStatus: "active" as const,
    archivedAt: null,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    masterSetId: "jp-2026",
    opening: { balanceLines: [], journals: [] },
    createdAt: `${year}-01-01T00:00:00.000Z`,
    updatedAt: `${year}-01-01T00:00:00.000Z`,
  };
}

describe("splitReadableBookFilePeriods when the environment fails", () => {
  it("stops instead of naming the period unreadable when memory runs out", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const bytes = await seededBookBytes({
      fiscalPeriods: [seedPeriod("fp-2025", 2025), seedPeriod("fp-2026", 2026)],
      entries: [],
      fixedAssets: [],
    });
    failure.onOpen = 2;

    await expect(splitReadableBookFilePeriods(bytes)).rejects.toThrow(
      "Allocation failed",
    );
    expect(logged.join("\n")).toMatch(/fp-2025 could not be split out/);
  });
});
