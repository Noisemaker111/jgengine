import { expect, test } from "bun:test";

import { checkSaveStates, describeSaveStateFailures } from "../../../../shared/saveStates";
import { orbitSaveStates } from "./saveStates";
import { BLOOM_CROPS, LIFESTYLES } from "./types";

/**
 * The save-state gate, for `shared/saveStates.ts`: every lifestyle, bloom crop, job and the legal
 * ends of the credit ledger are encoded into a household save this build wrote and decoded again.
 * The decoder reads those sets from the type's own list, so a value the type allows cannot be
 * refused on load.
 */
test("every value the household's own types allow loads unchanged", () => {
  const failures = checkSaveStates(orbitSaveStates);
  expect(failures.length === 0 ? "" : `\n${describeSaveStateFailures(failures)}`).toBe("");
});

test("the gate walks the lists the decoder reads, not a copy", () => {
  const lifestyle = orbitSaveStates.axes.find((candidate) => candidate.field === "household.members[].lifestyle");
  const crop = orbitSaveStates.axes.find((candidate) => candidate.field === "household.members[].bloomCrop");
  expect(lifestyle?.values).toEqual([...LIFESTYLES]);
  expect(crop?.values).toEqual([...BLOOM_CROPS]);
});
