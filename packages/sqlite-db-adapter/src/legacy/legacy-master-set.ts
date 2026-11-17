import { MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE } from "@rubydogjp/openkk-engine";

export function readLegacyStoredMasterSetId(stored: string | null): string {
  return stored ?? MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE;
}
