import { afterEach } from "vitest";

import { runDbPortConformance } from "../../server-ports/test-support/db-port-conformance.js";
import {
  closeTestBooks,
  emptyStore,
  openTestBooks,
  seededStore,
} from "../test-support/books.js";

afterEach(closeTestBooks);

runDbPortConformance("books-db-adapter (one book per fiscal period)", {
  makeAdapter: async () => (await openTestBooks(emptyStore())).adapter.db,
  makeSeededAdapter: async (seed) =>
    (await openTestBooks(await seededStore(seed))).adapter.db,
});
