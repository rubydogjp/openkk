import { describe, expect, it } from "vitest";

import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

describe("runInTransaction", () => {
  it("rethrows the operation error after a successful rollback", async () => {
    const operationError = new Error("write failed");
    const calls: string[] = [];
    const db = sqlDbThatRecords(calls);

    await expect(
      runInTransaction(db, async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
  });

  it("retains both errors when rollback also fails", async () => {
    const operationError = new Error("write failed");
    const rollbackError = new Error("rollback failed");
    const db: SqlDb = {
      async exec(input) {
        if (input === "ROLLBACK") throw rollbackError;
        return [];
      },
    };

    const error = await captureError(() =>
      runInTransaction(db, async () => {
        throw operationError;
      }),
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).cause).toBe(operationError);
    expect((error as AggregateError).errors).toEqual([
      operationError,
      rollbackError,
    ]);
  });
});

function sqlDbThatRecords(calls: string[]): SqlDb {
  return {
    async exec(input) {
      if (typeof input === "string") calls.push(input);
      return [];
    },
  };
}

async function captureError(operation: () => Promise<void>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to reject");
}
