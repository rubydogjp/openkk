import type { OpenkkServerPort } from "@rubydogjp/openkk-server-ports";

export function serializeDataOperations(
  api: OpenkkServerPort,
): OpenkkServerPort {
  let tail: Promise<void> = Promise.resolve();
  const serialize = <Args extends unknown[], Result>(
    operation: (...args: Args) => Promise<Result>,
  ) =>
    (...args: Args): Promise<Result> => {
      const result = tail.then(
        () => operation(...args),
        () => operation(...args),
      );
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    };

  return {
    ...api,
    preClosing: {
      ...api.preClosing,
      get: serialize(api.preClosing.get),
      run: serialize(api.preClosing.run),
      cancel: serialize(api.preClosing.cancel),
    },
    closing: {
      ...api.closing,
      get: serialize(api.closing.get),
      run: serialize(api.closing.run),
    },
    entries: {
      ...api.entries,
      getAll: serialize(api.entries.getAll),
      create: serialize(api.entries.create),
      patch: serialize(api.entries.patch),
      remove: serialize(api.entries.remove),
      importMany: serialize(api.entries.importMany),
    },
    fiscalPeriod: {
      ...api.fiscalPeriod,
      getAll: serialize(api.fiscalPeriod.getAll),
      create: serialize(api.fiscalPeriod.create),
      createNext: serialize(api.fiscalPeriod.createNext),
      importArchived: serialize(api.fiscalPeriod.importArchived),
      patch: serialize(api.fiscalPeriod.patch),
      archive: serialize(api.fiscalPeriod.archive),
      purgeArchivedData: serialize(api.fiscalPeriod.purgeArchivedData),
      remove: serialize(api.fiscalPeriod.remove),
    },
    fixedAssets: {
      ...api.fixedAssets,
      getAll: serialize(api.fixedAssets.getAll),
      create: serialize(api.fixedAssets.create),
      patch: serialize(api.fixedAssets.patch),
      remove: serialize(api.fixedAssets.remove),
    },
  };
}
