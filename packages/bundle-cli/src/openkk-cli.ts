import { createRequire } from "node:module";
import {
  runTerminalClient,
  type TerminalIo,
} from "@rubydogjp/openkk-client-terminal";

import { openCliBook } from "./book.js";

export const DEFAULT_CLI_FILE = "book.openkk";
export const DEFAULT_CLI_USER_ID = "openkk-original-user";
export const CLI_FILE_ENV = "OPENKK_FILE";
const CLI_TITLE = "オープン会計 CLI (ベータ)";

export function runOpenkkCli(
  argv: readonly string[],
  io: TerminalIo,
): Promise<number> {
  return runTerminalClient(argv, io, {
    title: CLI_TITLE,
    version: readCliVersion(),
    defaultBookFile: DEFAULT_CLI_FILE,
    bookFileEnv: CLI_FILE_ENV,
    defaultUserId: DEFAULT_CLI_USER_ID,
    openBook: openCliBook,
  });
}

function readCliVersion(): string {
  const packageJson = createRequire(import.meta.url)("../package.json") as {
    version: string;
  };
  return packageJson.version;
}
