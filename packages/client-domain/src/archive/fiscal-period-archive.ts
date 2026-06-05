export const FISCAL_PERIOD_ARCHIVE_FORMAT = "openkk.fiscal-period-archive";
export const FISCAL_PERIOD_ARCHIVE_VERSION = 1;

export type FiscalPeriodArchiveManifest = {
  format: typeof FISCAL_PERIOD_ARCHIVE_FORMAT;
  version: typeof FISCAL_PERIOD_ARCHIVE_VERSION;
  createdAt: string;
  fiscalPeriodId: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type FiscalPeriodArchivePayload = {
  manifest: FiscalPeriodArchiveManifest;
  fiscalPeriod: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
};

type ZipFileInput = {
  name: string;
  bytes: Uint8Array;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ZIP_STORE_METHOD = 0;
const ZIP_UTF8_FLAG = 0x0800;

export function buildFiscalPeriodArchivePayload(input: {
  createdAt: string;
  fiscalPeriod: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } & Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
  closings: Array<Record<string, unknown>>;
}): FiscalPeriodArchivePayload {
  return {
    manifest: {
      format: FISCAL_PERIOD_ARCHIVE_FORMAT,
      version: FISCAL_PERIOD_ARCHIVE_VERSION,
      createdAt: input.createdAt,
      fiscalPeriodId: input.fiscalPeriod.id,
      name: input.fiscalPeriod.name,
      startDate: input.fiscalPeriod.startDate,
      endDate: input.fiscalPeriod.endDate,
    },
    fiscalPeriod: { ...input.fiscalPeriod },
    entries: input.entries.map((entry) => ({ ...entry })),
    fixedAssets: input.fixedAssets.map((asset) => ({ ...asset })),
    closings: input.closings.map((closing) => ({ ...closing })),
  };
}

export function createFiscalPeriodArchiveZip(
  payload: FiscalPeriodArchivePayload,
): Uint8Array {
  assertFiscalPeriodArchivePayload(payload);
  return createStoreZip([
    jsonFile("manifest.json", payload.manifest),
    jsonFile("fiscal-period.json", payload.fiscalPeriod),
    jsonFile("entries.json", payload.entries),
    jsonFile("fixed-assets.json", payload.fixedAssets),
    jsonFile("closings.json", payload.closings),
  ]);
}

export function readFiscalPeriodArchiveZip(
  bytes: Uint8Array,
): FiscalPeriodArchivePayload {
  const files = readStoreZip(bytes);
  const payload: FiscalPeriodArchivePayload = {
    manifest: readJsonFile(files, "manifest.json"),
    fiscalPeriod: readJsonFile(files, "fiscal-period.json"),
    entries: readJsonFile(files, "entries.json"),
    fixedAssets: readJsonFile(files, "fixed-assets.json"),
    closings: readJsonFile(files, "closings.json"),
  };
  assertFiscalPeriodArchivePayload(payload);
  return payload;
}

export function buildFiscalPeriodArchiveFilename(input: {
  name: string;
  startDate: string;
  endDate: string;
}): string {
  const safeName = input.name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const base = safeName.length > 0 ? safeName : "fiscal-period";
  return `${base}_${input.startDate}_${input.endDate}.zip`;
}

function jsonFile(name: string, value: unknown): ZipFileInput {
  return {
    name,
    bytes: textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`),
  };
}

function createStoreZip(files: ZipFileInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.name);
    const crc = crc32(file.bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, ZIP_UTF8_FLAG);
    writeUint16(localView, 8, ZIP_STORE_METHOD);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, file.bytes.length);
    writeUint32(localView, 22, file.bytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, file.bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, ZIP_UTF8_FLAG);
    writeUint16(centralView, 10, ZIP_STORE_METHOD);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, file.bytes.length);
    writeUint32(centralView, 24, file.bytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + file.bytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = totalLength(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, centralDirectoryOffset);
  writeUint16(endView, 20, 0);
  return concatBytes([...localParts, ...centralParts, end]);
}

function readStoreZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) {
      throw new Error("archive zip has an invalid local file header");
    }
    if (offset + 30 > bytes.length) {
      throw new Error("archive zip local file header is truncated");
    }
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    const expectedCrc = view.getUint32(14, true);
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    if ((flags & 0x0008) !== 0) {
      throw new Error("archive zip with data descriptors is not supported");
    }
    if (method !== ZIP_STORE_METHOD) {
      throw new Error("archive zip must use stored entries");
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error("archive zip stored entry size mismatch");
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error("archive zip entry extends past the end of the file");
    }
    const name = textDecoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) {
      throw new Error(`archive zip entry checksum mismatch: ${name}`);
    }
    files.set(name, data);
    offset = dataEnd;
  }
  return files;
}

function readJsonFile<T>(files: Map<string, Uint8Array>, name: string): T {
  const bytes = files.get(name);
  if (bytes == null) throw new Error(`archive file missing: ${name}`);
  return JSON.parse(textDecoder.decode(bytes)) as T;
}

function assertFiscalPeriodArchivePayload(
  payload: FiscalPeriodArchivePayload,
): void {
  if (payload.manifest?.format !== FISCAL_PERIOD_ARCHIVE_FORMAT) {
    throw new Error("archive manifest format is invalid");
  }
  if (payload.manifest.version !== FISCAL_PERIOD_ARCHIVE_VERSION) {
    throw new Error("archive manifest version is not supported");
  }
  if (typeof payload.manifest.fiscalPeriodId !== "string") {
    throw new Error("archive manifest fiscalPeriodId is invalid");
  }
  if (
    typeof payload.fiscalPeriod?.id === "string" &&
    payload.fiscalPeriod.id !== payload.manifest.fiscalPeriodId
  ) {
    throw new Error("archive fiscalPeriod id does not match manifest");
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error("archive entries must be an array");
  }
  if (!Array.isArray(payload.fixedAssets)) {
    throw new Error("archive fixedAssets must be an array");
  }
  if (!Array.isArray(payload.closings)) {
    throw new Error("archive closings must be an array");
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(totalLength(parts));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function totalLength(parts: Uint8Array[]): number {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function writeUint16(view: DataView, byteOffset: number, value: number) {
  view.setUint16(byteOffset, value, true);
}

function writeUint32(view: DataView, byteOffset: number, value: number) {
  view.setUint32(byteOffset, value >>> 0, true);
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable != null) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}
