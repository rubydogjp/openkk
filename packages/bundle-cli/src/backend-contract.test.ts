import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";

import { BACKEND_CONTRACT_CASES } from "@rubydogjp/openkk-driver/backend-contract";

import { openCliBook } from "./book.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("backend port contract over a book file on disk", () => {
  it.each(BACKEND_CONTRACT_CASES)("$name", async (contractCase) => {
    await contractCase.run(async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-contract-"));
      tempDirs.push(dir);
      const book = await openCliBook(
        path.join(dir, "book.openkk"),
        "contract-user",
      );
      return { backend: book.backend, close: async () => book.close() };
    });
  });
});
