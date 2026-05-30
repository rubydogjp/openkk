import { describe, expect, it } from "vitest";

import { deriveSteps } from "./step-derivation";

describe("deriveSteps", () => {
  it("keeps exactly one current step before all steps are done", () => {
    const cases = [
      [false, false, false, false, false, false],
      [true, false, false, false, false, false],
      [true, true, false, false, false, false],
      [true, true, true, false, false, false],
      [true, true, true, true, false, false],
      [true, true, true, true, true, false],
    ];

    for (const flags of cases) {
      const steps = deriveFromFlags(flags);
      expect(steps.filter((step) => step.status === "doing")).toHaveLength(1);
      expect(steps.map((step) => step.no)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("marks later steps todo after the first incomplete step", () => {
    const steps = deriveFromFlags([true, false, true, true, true, true]);
    expect(steps.map((step) => step.status)).toEqual([
      "done",
      "doing",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("marks every step done after the next period exists", () => {
    const steps = deriveFromFlags([true, true, true, true, true, true]);
    expect(steps.map((step) => step.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
  });
});

function deriveFromFlags(flags: boolean[]) {
  return deriveSteps({
    settingsCompleted: flags[0]!,
    openingBalancesCompleted: flags[1]!,
    hasAnyClosing: flags[2]!,
    hasFinalClosing: flags[3]!,
    hasReceivedDocuments: flags[4]!,
    hasNextFiscalPeriod: flags[5]!,
  });
}
