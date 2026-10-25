import { expect, test } from "bun:test";

import { checkSaveStates, describeSaveStateFailures } from "../../../shared/saveStates";
import { parkSaveStates } from "./saveStates";
import { GUEST_PHASES } from "./session";

/**
 * The save-state gate, for this game: every value a guest phase, a guest kind, an unlock or a
 * scenario result can hold is encoded into a real park save and decoded again. The regression it
 * pins is the one that cost a player a park: the decoder accepted three phases of a five-value type,
 * so a save taken while a guest was queued or riding was refused and the park was archived.
 */
test("every value the park's own types allow loads unchanged", () => {
  const failures = checkSaveStates(parkSaveStates);
  expect(failures.length === 0 ? "" : `\n${describeSaveStateFailures(failures)}`).toBe("");
});

test("the gate walks the guest phases the old decoder refused, read from the type's list", () => {
  const axis = parkSaveStates.axes.find((candidate) => candidate.field === "guests[].state.phase");
  expect(axis?.values).toEqual([...GUEST_PHASES]);
  expect(axis?.values).toContain("queued");
  expect(axis?.values).toContain("riding");
});
