import {
  assertLegacyArchiveZipByteLength,
  looksLikeLegacyArchiveZip,
  readLegacyArchiveZip,
  type OpenkkAppState,
} from "@rubydogjp/openkk-driver";

const ZIP_SIGNATURE_BYTE_LENGTH = 4;

export async function isLegacyArchiveZipFile(file: File): Promise<boolean> {
  return looksLikeLegacyArchiveZip(
    new Uint8Array(
      await file.slice(0, ZIP_SIGNATURE_BYTE_LENGTH).arrayBuffer(),
    ),
  );
}

export async function importLegacyArchiveZipFile(
  appState: Pick<OpenkkAppState, "importArchivedFiscalPeriod">,
  file: File,
): Promise<string> {
  assertLegacyArchiveZipByteLength(file.size);
  return appState.importArchivedFiscalPeriod(
    readLegacyArchiveZip(new Uint8Array(await file.arrayBuffer())),
  );
}
