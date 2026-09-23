import { describe, expect, it } from "vitest";

import { AppError } from "../shared/app-error.js";
import {
  assertFiscalPeriodArchiveByteLength,
  MAX_FISCAL_PERIOD_ARCHIVE_BYTES,
} from "./fiscal-period-archive-zip.js";
import {
  FISCAL_PERIOD_ARCHIVE_FORMAT,
  FISCAL_PERIOD_ARCHIVE_VERSION,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} from "./fiscal-period-archive.js";

describe("fiscal period archive", () => {
  it("rejects oversized input before a browser needs to allocate its bytes", () => {
    expect(() =>
      assertFiscalPeriodArchiveByteLength(MAX_FISCAL_PERIOD_ARCHIVE_BYTES),
    ).not.toThrow();
    expect(() =>
      assertFiscalPeriodArchiveByteLength(
        MAX_FISCAL_PERIOD_ARCHIVE_BYTES + 1,
      ),
    ).toThrow(/size limit/);
    expect(() => assertFiscalPeriodArchiveByteLength(Number.NaN)).toThrow(
      /size limit/,
    );
  });

  it("keeps the archive format a stable public contract", () => {
    expect(FISCAL_PERIOD_ARCHIVE_FORMAT).toBe("openkk.fiscal-period-archive");
    expect(FISCAL_PERIOD_ARCHIVE_VERSION).toBe(2);

    const zip = createFiscalPeriodArchiveZip(
      buildFiscalPeriodArchivePayload({
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
      }),
    );
    const names = listZipEntryNames(zip).sort();
    expect(names).toEqual([
      "closings.json",
      "entries.json",
      "fiscal-period.json",
      "fixed-assets.json",
      "manifest.json",
    ]);

    const payload = readFiscalPeriodArchiveZip(zip);
    expect(payload.manifest.format).toBe("openkk.fiscal-period-archive");
    expect(payload.manifest.version).toBe(2);
  });

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

  it("preserves null fixed-asset disposal fields", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [],
      fixedAssets: [
        { id: "asset-1", disposalDate: null, disposalPrice: null },
      ],
      closings: [],
    });

    expect(payload.fixedAssets[0]).toMatchObject({
      disposalDate: null,
      disposalPrice: null,
    });
  });

  it("preserves null entry localIds", () => {
    const payload = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [{ id: "entry-1", localId: null }],
      fixedAssets: [],
      closings: [],
    });

    expect(payload.entries[0]).toMatchObject({ localId: null });
  });

  it("reads version 1 archives", () => {
    const current = buildFiscalPeriodArchivePayload({
      createdAt: "2026-06-05T00:00:00.000Z",
      fiscalPeriod: {
        id: "fp-1",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      entries: [{ id: "entry-1", localId: "" }],
      fixedAssets: [
        { id: "asset-1", disposalDate: "", disposalPrice: 0 },
      ],
      closings: [],
    });
    const legacy = {
      ...current,
      manifest: { ...current.manifest, version: 1 as const },
    };

    expect(
      readFiscalPeriodArchiveZip(createFiscalPeriodArchiveZip(legacy)),
    ).toEqual(legacy);
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

  it("rejects invalid UTF-8 in JSON even when its checksum is valid", () => {
    const zip = createFiscalPeriodArchiveZip(
      buildFiscalPeriodArchivePayload({
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
      }),
    );
    const invalidUtf8 = mutateStoredZipEntry(zip, "entries.json", (bytes) => {
      const index = findBytePattern(bytes, new TextEncoder().encode("entry-1"));
      expect(index).toBeGreaterThanOrEqual(0);
      bytes[index] = 0xff;
    });

    const error = captureError(() => readFiscalPeriodArchiveZip(invalidUtf8));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("json parse");
    expect((error as AppError).messageForUser).toContain("データ形式");
  });

  it("rejects invalid UTF-8 in zip filenames", () => {
    const zip = createFiscalPeriodArchiveZip(
      buildFiscalPeriodArchivePayload({
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
      }),
    );
    const invalidUtf8 = new Uint8Array(zip);
    const localName = findBytePattern(
      invalidUtf8,
      new TextEncoder().encode("manifest.json"),
    );
    expect(localName).toBeGreaterThanOrEqual(0);
    invalidUtf8[localName] = 0xff;

    const error = captureError(() => readFiscalPeriodArchiveZip(invalidUtf8));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("UTF-8");
    expect((error as AppError).messageForUser).toContain("破損");
  });

  it("rejects an archive truncated before its central directory", () => {
    const zip = createFiscalPeriodArchiveZip(
      buildFiscalPeriodArchivePayload({
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
      }),
    );
    const centralDirectoryOffset = findBytePattern(
      zip,
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
    );
    const truncated = zip.slice(0, centralDirectoryOffset);

    const error = captureError(() => readFiscalPeriodArchiveZip(truncated));
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("end record");
    expect((error as AppError).messageForUser).toContain("破損");
  });

  it("rejects central-directory metadata that disagrees with local headers", () => {
    const zip = createFiscalPeriodArchiveZip(
      buildFiscalPeriodArchivePayload({
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
      }),
    );
    const corrupted = new Uint8Array(zip);
    const centralDirectoryOffset = findBytePattern(
      corrupted,
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
    );
    expect(centralDirectoryOffset).toBeGreaterThan(0);
    const centralView = new DataView(
      corrupted.buffer,
      corrupted.byteOffset + centralDirectoryOffset,
    );
    centralView.setUint32(16, centralView.getUint32(16, true) ^ 1, true);

    const error = captureError(() => readFiscalPeriodArchiveZip(corrupted));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "central directory",
    );
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

function listZipEntryNames(zip: Uint8Array): string[] {
  const decoder = new TextDecoder();
  const names: string[] = [];
  let offset = 0;
  while (offset + 4 <= zip.length) {
    const view = new DataView(zip.buffer, zip.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const compressedSize = view.getUint32(18, true);
    names.push(
      decoder.decode(zip.slice(offset + 30, offset + 30 + nameLength)),
    );
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return names;
}

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
  const endView = new DataView(
    output.buffer,
    output.byteOffset + output.length - 22,
    22,
  );
  endView.setUint32(16, centralDirectoryOffset + localEntryEnd, true);
  return output;
}

function mutateStoredZipEntry(
  zip: Uint8Array,
  targetName: string,
  mutate: (bytes: Uint8Array) => void,
): Uint8Array {
  const output = new Uint8Array(zip);
  const decoder = new TextDecoder();
  let localOffset = 0;
  let targetLocalOffset = -1;
  let targetDataStart = -1;
  let targetDataEnd = -1;
  while (localOffset + 30 <= output.length) {
    const view = new DataView(
      output.buffer,
      output.byteOffset + localOffset,
      output.length - localOffset,
    );
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const compressedSize = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const name = decoder.decode(
      output.slice(localOffset + 30, localOffset + 30 + nameLength),
    );
    const dataStart = localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (name === targetName) {
      targetLocalOffset = localOffset;
      targetDataStart = dataStart;
      targetDataEnd = dataEnd;
      break;
    }
    localOffset = dataEnd;
  }
  expect(targetLocalOffset).toBeGreaterThanOrEqual(0);
  const data = output.slice(targetDataStart, targetDataEnd);
  mutate(data);
  output.set(data, targetDataStart);
  const crc = testCrc32(data);
  new DataView(
    output.buffer,
    output.byteOffset + targetLocalOffset,
  ).setUint32(14, crc, true);

  let centralOffset = findBytePattern(
    output,
    new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
  );
  let centralUpdated = false;
  while (centralOffset >= 0 && centralOffset + 46 <= output.length) {
    const view = new DataView(
      output.buffer,
      output.byteOffset + centralOffset,
      output.length - centralOffset,
    );
    if (view.getUint32(0, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const name = decoder.decode(
      output.slice(centralOffset + 46, centralOffset + 46 + nameLength),
    );
    if (name === targetName) {
      view.setUint32(16, crc, true);
      centralUpdated = true;
      break;
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  expect(centralUpdated).toBe(true);
  return output;
}

function testCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
