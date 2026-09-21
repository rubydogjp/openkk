import { AppError } from "../shared/app-error.js";

export type ArchiveZipFile = {
  name: string;
  bytes: Uint8Array;
};

type LocalZipEntryMetadata = {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const ZIP_STORE_METHOD = 0;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_END_SIZE = 22;
export const MAX_FISCAL_PERIOD_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 32;

export function createStoredZip(files: ArchiveZipFile[]): Uint8Array {
  if (files.length > MAX_ARCHIVE_FILES) {
    throw invalidArchiveContentError("archive zip contains too many files");
  }
  if (files.some((file) => file.bytes.length > MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES)) {
    throw invalidArchiveContentError("archive zip entry exceeds the size limit");
  }
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
  const end = new Uint8Array(ZIP_END_SIZE);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, centralDirectoryOffset);
  writeUint16(endView, 20, 0);
  const parts = [...localParts, ...centralParts, end];
  assertFiscalPeriodArchiveByteLength(totalLength(parts));
  return concatBytes(parts);
}

export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  assertFiscalPeriodArchiveByteLength(bytes.length);
  if (bytes.length < ZIP_END_SIZE) {
    throw corruptedArchiveFileError("archive zip end record is missing");
  }
  const endOffset = bytes.length - ZIP_END_SIZE;
  const endView = new DataView(
    bytes.buffer,
    bytes.byteOffset + endOffset,
    ZIP_END_SIZE,
  );
  if (endView.getUint32(0, true) !== 0x06054b50) {
    throw corruptedArchiveFileError("archive zip end record is missing");
  }
  if (
    endView.getUint16(4, true) !== 0 ||
    endView.getUint16(6, true) !== 0 ||
    endView.getUint16(20, true) !== 0
  ) {
    throw unsupportedArchiveFileError(
      "archive zip must be a single-disk archive without a comment",
    );
  }
  const diskEntryCount = endView.getUint16(8, true);
  const totalEntryCount = endView.getUint16(10, true);
  const centralDirectorySize = endView.getUint32(12, true);
  const centralDirectoryOffset = endView.getUint32(16, true);
  if (
    diskEntryCount !== totalEntryCount ||
    totalEntryCount > MAX_ARCHIVE_FILES ||
    centralDirectoryOffset + centralDirectorySize !== endOffset
  ) {
    throw corruptedArchiveFileError(
      "archive zip central directory metadata is invalid",
    );
  }

  const files = new Map<string, Uint8Array>();
  const localEntries = new Map<string, LocalZipEntryMetadata>();
  let offset = 0;
  while (offset < centralDirectoryOffset) {
    if (offset + 4 > centralDirectoryOffset) {
      throw corruptedArchiveFileError(
        "archive zip local file header is truncated",
      );
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) {
      throw unsupportedArchiveFileError(
        "archive zip has an invalid local file header",
      );
    }
    if (offset + 30 > centralDirectoryOffset) {
      throw corruptedArchiveFileError(
        "archive zip local file header is truncated",
      );
    }
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    const expectedCrc = view.getUint32(14, true);
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    if ((flags & 0x0008) !== 0) {
      throw unsupportedArchiveFileError(
        "archive zip with data descriptors is not supported",
      );
    }
    if (method !== ZIP_STORE_METHOD) {
      throw unsupportedArchiveFileError("archive zip must use stored entries");
    }
    if (compressedSize !== uncompressedSize) {
      throw unsupportedArchiveFileError(
        "archive zip stored entry size mismatch",
      );
    }
    if (uncompressedSize > MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES) {
      throw invalidArchiveContentError(
        "archive zip entry exceeds the size limit",
      );
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralDirectoryOffset) {
      throw corruptedArchiveFileError(
        "archive zip entry extends past the end of the file",
      );
    }
    const name = decodeArchiveFilename(
      bytes.slice(nameStart, nameStart + nameLength),
    );
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) {
      throw corruptedArchiveFileError(
        `archive zip entry checksum mismatch: ${name}`,
      );
    }
    if (files.has(name)) {
      throw invalidArchiveContentError(
        `archive zip contains duplicate file: ${name}`,
      );
    }
    files.set(name, data);
    localEntries.set(name, {
      name,
      flags,
      method,
      crc: expectedCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset: offset,
    });
    if (files.size > MAX_ARCHIVE_FILES) {
      throw invalidArchiveContentError("archive zip contains too many files");
    }
    offset = dataEnd;
  }
  if (
    offset !== centralDirectoryOffset ||
    files.size !== totalEntryCount ||
    !hasValidCentralDirectory(
      bytes,
      centralDirectoryOffset,
      centralDirectorySize,
      totalEntryCount,
      localEntries,
    )
  ) {
    throw corruptedArchiveFileError(
      "archive zip central directory is incomplete",
    );
  }
  return files;
}

export function assertFiscalPeriodArchiveByteLength(byteLength: number): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MAX_FISCAL_PERIOD_ARCHIVE_BYTES
  ) {
    throw invalidArchiveContentError("archive zip exceeds the size limit");
  }
}

function hasValidCentralDirectory(
  bytes: Uint8Array,
  start: number,
  size: number,
  expectedEntries: number,
  localEntries: ReadonlyMap<string, LocalZipEntryMetadata>,
): boolean {
  const end = start + size;
  let offset = start;
  let count = 0;
  const seenNames = new Set<string>();
  while (offset < end) {
    if (offset + 46 > end) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x02014b50) return false;
    const flags = view.getUint16(8, true);
    const method = view.getUint16(10, true);
    const crc = view.getUint32(16, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const nameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const diskStart = view.getUint16(34, true);
    const localHeaderOffset = view.getUint32(42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end) return false;
    const name = decodeArchiveFilename(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );
    const local = localEntries.get(name);
    if (
      local == null ||
      seenNames.has(name) ||
      diskStart !== 0 ||
      flags !== local.flags ||
      method !== local.method ||
      crc !== local.crc ||
      compressedSize !== local.compressedSize ||
      uncompressedSize !== local.uncompressedSize ||
      localHeaderOffset !== local.localHeaderOffset
    ) {
      return false;
    }
    seenNames.add(name);
    count += 1;
    offset = next;
  }
  return (
    offset === end &&
    count === expectedEntries &&
    seenNames.size === localEntries.size
  );
}

function decodeArchiveFilename(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw corruptedArchiveFileError("archive zip filename is not valid UTF-8");
  }
}

function corruptedArchiveFileError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "圧縮済みファイルが破損している可能性があります。別のファイルを選択してください。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

function unsupportedArchiveFileError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "対応していない形式のファイルです。オープン会計で作成した圧縮済みファイルを選択してください。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

export function invalidArchiveContentError(
  messageForDeveloper: string,
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "圧縮済みファイルの内容を確認できませんでした。作成元の会計期間データからもう一度圧縮保存してください。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
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
