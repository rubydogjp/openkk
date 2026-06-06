import { describe, expect, it } from "vitest";

import { AppError } from "../shared/app-error";
import {
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} from "./fiscal-period-archive";

describe("fiscal period archive", () => {
  it("round-trips a fiscal period archive through a zip file", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        archiveStatus: "archived",
      },
      entries: [{ id: "entry-1", fiscalPeriodId: "fp-1" }],
      fixedAssets: [{ id: "asset-1", fiscalPeriodId: "fp-1" }],
      closings: [{ fiscalPeriodId: "fp-1", year: 2026, kind: "closing" }],
    });

    const zip = createFiscalPeriodArchiveZip(payload);

    expect(readFiscalPeriodArchiveZip(zip)).toEqual(payload);
  });

  it("rejects payloads with an unsupported manifest format", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [],
      fixedAssets: [],
      closings: [],
    });
    expect(() =>
      createFiscalPeriodArchiveZip({
        ...payload,
        manifest: { ...payload.manifest, format: "wrong" as never },
      }),
    ).toThrow(/format/);
  });

  it("rejects archives whose period id does not match the manifest", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [],
      fixedAssets: [],
      closings: [],
    });

    expect(() =>
      createFiscalPeriodArchiveZip({
        ...payload,
        fiscalPeriod: { ...payload.fiscalPeriod, id: "fp-other" },
      }),
    ).toThrow(/manifest/);
  });

  it("rejects archives with corrupted zip entry bytes", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [{ id: "entry-1", fiscalPeriodId: "fp-1" }],
      fixedAssets: [],
      closings: [],
    });
    const zip = createFiscalPeriodArchiveZip(payload);
    const corrupted = new Uint8Array(zip);
    const index = findBytePattern(
      corrupted,
      new TextEncoder().encode("entry-1"),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    corrupted[index]! ^= 0xff;

    const error = captureError(() => readFiscalPeriodArchiveZip(corrupted));
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("checksum");
    expect((error as AppError).messageForUser).toContain("破損");
  });

  it("rejects archives with duplicate zip entries", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [],
      fixedAssets: [],
      closings: [],
    });
    const zip = createFiscalPeriodArchiveZip(payload);
    const duplicated = duplicateFirstLocalZipEntry(zip);

    const error = captureError(() => readFiscalPeriodArchiveZip(duplicated));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("duplicate");
    expect((error as AppError).messageForUser).toContain("内容を確認");
  });

  it("builds a safe zip filename", () => {
    expect(
      buildFiscalPeriodArchiveFilename({
        name: '2026 年分 / "main"',
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toBe("2026_年分____main__2026-01-01_2026-12-31.zip");
  });

  it("throws AppError when archive content is invalid", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [],
      fixedAssets: [],
      closings: [],
    });

    const error = captureError(() =>
      createFiscalPeriodArchiveZip({
        ...payload,
        manifest: { ...payload.manifest, version: 999 as never },
      }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("version");
    expect((error as AppError).messageForUser).toContain("内容を確認");
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

function findBytePattern(haystack: Uint8Array, needle: Uint8Array): number {
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function duplicateFirstLocalZipEntry(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset);
  const compressedSize = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const localEntryEnd = 30 + nameLength + extraLength + compressedSize;
  const centralDirectoryOffset = findBytePattern(
    zip,
    new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
  );
  expect(centralDirectoryOffset).toBeGreaterThan(localEntryEnd);

  const output = new Uint8Array(zip.length + localEntryEnd);
  output.set(zip.slice(0, centralDirectoryOffset), 0);
  output.set(zip.slice(0, localEntryEnd), centralDirectoryOffset);
  output.set(
    zip.slice(centralDirectoryOffset),
    centralDirectoryOffset + localEntryEnd,
  );
  return output;
}
