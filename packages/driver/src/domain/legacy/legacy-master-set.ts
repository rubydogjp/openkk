import { MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE } from "../entries/master-sets.js";

export function readLegacyFiscalPeriodMasterSetId(period: {
  masterSetId: unknown;
}): string {
  return typeof period.masterSetId === "string" &&
    period.masterSetId.trim() !== ""
    ? period.masterSetId
    : MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE;
}
