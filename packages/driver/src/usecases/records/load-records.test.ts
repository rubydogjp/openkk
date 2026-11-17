import { describe, expect, it } from "vitest";

import { AppError } from "../../domain/index.js";
import type { MasterSetApiRecord } from "../../ports/index.js";
import {
  FAKE_ACCOUNTS,
  fakeBackend,
} from "../../../test-support/fake-backend.js";
import { journalMasterOfSet, loadMasterSets } from "./load-records.js";

const [CASH, EQUIPMENT, SALES] = FAKE_ACCOUNTS;

function masterSet(
  id: string,
  effectiveFrom: string,
  bookAccounts: MasterSetApiRecord["bookAccounts"],
  taxCategoryName: string,
): MasterSetApiRecord {
  return {
    id,
    name: id,
    effectiveFrom,
    bookAccounts,
    taxCategories: [
      {
        id: "tax_10",
        name: taxCategoryName,
        rate: 1000,
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
    ],
    businessCategories: [],
  };
}

const TWO_SETS = [
  masterSet("jp-2026", "2000-01-01", [CASH!, EQUIPMENT!, SALES!], "課税 10%"),
  masterSet(
    "jp-2028",
    "2028-01-01",
    [CASH!, { ...SALES!, name: "売上" }],
    "標準税率 10%",
  ),
];

describe("journalMasterOfSet", () => {
  it("lists the accounts and categories of the period's version, and keeps the accounts of other versions aside", () => {
    const master = journalMasterOfSet(TWO_SETS, "jp-2028");

    expect(master.accounts.map(({ name }) => name)).toEqual(["現金", "売上"]);
    expect(master.otherAccounts.map(({ id }) => id)).toEqual([
      "acct_equipment",
    ]);
    expect(master.taxCategories.map(({ name }) => name)).toEqual([
      "標準税率 10%",
    ]);
    expect(journalMasterOfSet(TWO_SETS, "jp-2026").otherAccounts).toEqual([]);
  });

  it("uses the newest version for a version this app does not know", () => {
    expect(journalMasterOfSet(TWO_SETS, "jp-2099").taxCategories[0]?.name).toBe(
      "標準税率 10%",
    );
  });
});

describe("loadMasterSets", () => {
  it("reads the versions the backend serves", async () => {
    const fake = fakeBackend();

    const masterSets = await loadMasterSets(fake.backend);

    expect(masterSets.map(({ id }) => id)).toEqual(["jp-2026"]);
  });

  it("makes one version from the older endpoints when the backend does not serve versions yet", async () => {
    const fake = fakeBackend();
    fake.rejectNext(
      "masterData.getMasterSets",
      new AppError({
        messageForDeveloper: "not found",
        messageForUser: "見つかりませんでした",
        originalMessage: null,
        statusCode: 404,
        code: null,
      }),
    );

    const [only, ...rest] = await loadMasterSets(fake.backend);

    expect(rest).toEqual([]);
    expect(only).toMatchObject({ id: "jp-2026", name: "2026年版" });
    expect(only?.bookAccounts).toEqual(FAKE_ACCOUNTS);
  });

  it("does not hide other failures", async () => {
    const fake = fakeBackend();
    const failure = new Error("offline");
    fake.rejectNext("masterData.getMasterSets", failure);

    await expect(loadMasterSets(fake.backend)).rejects.toBe(failure);
  });
});
