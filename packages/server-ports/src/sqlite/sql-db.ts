export interface SqlDb {
  exec(
    arg:
      | string
      | {
          sql: string;
          bind?: unknown[];
          returnValue?: string;
          rowMode?: string;
        },
  ): Promise<unknown>;
}
