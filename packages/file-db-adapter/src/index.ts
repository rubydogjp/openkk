import {
  createSqliteDbAdapter,
  type DbSnapshot,
  type OpenkkDbPort,
  type SqlDb,
} from "@rubydogjp/openkk-server-ports";
export { type DbSnapshot } from "@rubydogjp/openkk-server-ports";

import { openFileSqliteDb, type FileSqliteInitOptions } from "./sqlite-init";

export type FileDbAdapterOptions = FileSqliteInitOptions;

export async function createFileDbAdapter(
  options: FileDbAdapterOptions,
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  const db = await openFileSqliteDb(options);
  return createSqliteDbAdapter(db as unknown as SqlDb, seed);
}
