import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-client-ports";

import { CliUsageError, type CliOutput } from "./cli-io.js";

export type CliOptions = {
  name: string | null;
  start: string | null;
  end: string | null;
  date: string | null;
  debit: string | null;
  credit: string | null;
  amount: string | null;
  description: string | null;
  businessRate: string | null;
  format: string | null;
  out: string | null;
  json: boolean;
};

export type CliCommandContext = {
  api: OpenkkBackendPort;
  output: CliOutput;
  args: string[];
  options: CliOptions;
  resolvePath(target: string): string;
};

export async function requireFiscalPeriod(
  api: OpenkkBackendPort,
  id: string | null,
): Promise<FiscalPeriodApiRecord> {
  if (id == null || id === "") {
    throw new CliUsageError("会計期間の ID を指定してください");
  }
  const period = (await api.fiscalPeriods.getAll()).find(
    (candidate) => candidate.id === id,
  );
  if (period == null) {
    throw new CliUsageError(`会計期間 ${id} はありません`);
  }
  return period;
}
