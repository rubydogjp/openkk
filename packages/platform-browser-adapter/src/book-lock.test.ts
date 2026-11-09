import { describe, expect, it } from "vitest";

import { fakeLockManager } from "../test-support/fake-lock-manager.js";
import { BookInUseError, createBookLocks } from "./book-lock.js";

describe("book locks", () => {
  it("refuses a book that another tab holds until that tab lets go", async () => {
    const locks = createBookLocks(fakeLockManager());

    const release = await locks.hold(
      "openkk-book:in-app:帳簿.openkk",
      "帳簿.openkk",
    );
    const refused = locks.hold("openkk-book:in-app:帳簿.openkk", "帳簿.openkk");
    await expect(refused).rejects.toThrow(BookInUseError);
    await expect(refused).rejects.toMatchObject({ bookName: "帳簿.openkk" });

    release();
    await Promise.resolve();
    const again = await locks.hold(
      "openkk-book:in-app:帳簿.openkk",
      "帳簿.openkk",
    );
    again();
  });

  it("holds each book on its own", async () => {
    const locks = createBookLocks(fakeLockManager());

    const first = await locks.hold("openkk-book:in-app:a.openkk", "a.openkk");
    const second = await locks.hold("openkk-book:in-app:b.openkk", "b.openkk");
    first();
    second();
  });

  it("lets every tab open the book when the browser has no locks", async () => {
    const locks = createBookLocks(null);

    const first = await locks.hold(
      "openkk-book:in-app:帳簿.openkk",
      "帳簿.openkk",
    );
    const second = await locks.hold(
      "openkk-book:in-app:帳簿.openkk",
      "帳簿.openkk",
    );
    first();
    second();
  });
});
