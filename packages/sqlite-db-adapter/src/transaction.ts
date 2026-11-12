import { stampChange, totalChanges } from "./change-stamp.js";
import { nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";

export async function runInTransaction<Result>(
  db: SqlDb,
  operation: () => Promise<Result>,
): Promise<Result> {
  await db.exec("BEGIN");
  try {
    const changesBefore = await totalChanges(db);
    const result = await operation();
    if ((await totalChanges(db)) !== changesBefore) {
      await stampChange(db, nowMs());
    }
    await db.exec("COMMIT");
    return result;
  } catch (operationError) {
    try {
      await db.exec("ROLLBACK");
    } catch (rollbackError) {
      throw transactionRollbackError(operationError, rollbackError);
    }
    throw operationError;
  }
}

export function transactionRollbackError(
  operationError: unknown,
  rollbackError: unknown,
): AggregateError {
  return new AggregateError(
    [operationError, rollbackError],
    "SQLite operation failed and its transaction could not be rolled back",
    { cause: operationError },
  );
}
