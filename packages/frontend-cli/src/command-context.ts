import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-driver";

import { CliUsageError, type CliOutput } from "./cli-output.js";

export const CLI_STRING_OPTIONS = [
  "name",
  "start",
  "end",
  "date",
  "debit",
  "credit",
  "amount",
  "description",
  "business-rate",
  "format",
  "out",
  "from",
  "from-period",
] as const;

export const CLI_FLAG_OPTIONS = ["json", "yes"] as const;

export type CliStringOption = (typeof CLI_STRING_OPTIONS)[number];
export type CliFlagOption = (typeof CLI_FLAG_OPTIONS)[number];

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
  from: string | null;
  fromPeriod: string | null;
  json: boolean;
  yes: boolean;
};

export function readCliOptions(
  text: (option: CliStringOption) => string | null,
  flag: (option: CliFlagOption) => boolean,
): CliOptions {
  return {
    name: text("name"),
    start: text("start"),
    end: text("end"),
    date: text("date"),
    debit: text("debit"),
    credit: text("credit"),
    amount: text("amount"),
    description: text("description"),
    businessRate: text("business-rate"),
    format: text("format"),
    out: text("out"),
    from: text("from"),
    fromPeriod: text("from-period"),
    json: flag("json"),
    yes: flag("yes"),
  };
}

export type CliFiles = {
  resolve(target: string): string;
  exists(filePath: string): boolean;
  readBytes(filePath: string): Uint8Array;
  writeText(filePath: string, text: string): void;
  writeBytes(filePath: string, bytes: Uint8Array): void;
};

export type CliBook = {
  backend: OpenkkBackendPort;
  close(): void;
};

export type CliBooks = {
  open(filePath: string): Promise<CliBook>;
};

export type CliCommandContext = {
  backend: OpenkkBackendPort;
  bookPath: string;
  output: CliOutput;
  files: CliFiles;
  books: CliBooks;
  args: string[];
  options: CliOptions;
  today(): Date;
};

export async function requireFiscalPeriod(
  backend: OpenkkBackendPort,
  id: string | null,
): Promise<FiscalPeriodApiRecord> {
  if (id == null || id === "") {
    throw new CliUsageError("会計期間の ID を指定してください");
  }
  const period = (await backend.fiscalPeriods.getAll()).find(
    (candidate) => candidate.id === id,
  );
  if (period == null) {
    throw new CliUsageError(`会計期間 ${id} はありません`);
  }
  return period;
}

export async function createNewBook(
  context: CliCommandContext,
  filePath: string,
): Promise<CliBook> {
  if (context.files.exists(filePath)) {
    throw new CliUsageError(`すでにファイルがあります: ${filePath}`);
  }
  return context.books.open(filePath);
}

export async function openExistingBook(
  context: CliCommandContext,
  filePath: string,
): Promise<CliBook> {
  if (!context.files.exists(filePath)) {
    throw new CliUsageError(`帳簿ファイルがありません: ${filePath}`);
  }
  return context.books.open(filePath);
}
