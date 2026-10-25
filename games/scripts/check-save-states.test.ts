import { expect, test } from "bun:test";

import { checkSaveStates, RULE } from "../shared/saveStates";
import { GAPS, REGISTERED, render, report } from "./check-save-states";

/**
 * The gate over every registered game. Any value a game's own type allows that its decoder refuses
 * or changes fails here, naming the game, the field and the value.
 */
test("every game's save states load unchanged", () => {
  const result = report();
  expect(result.failures.length === 0 ? "" : `\n${render(result)}`).toBe("");
});

test("each registered game proves its own saved save, not an empty one", () => {
  for (const gate of REGISTERED) {
    const base = gate.base();
    expect(base.length).toBeGreaterThan(2);
    expect(gate.axes.length).toBeGreaterThan(0);
    for (const axis of gate.axes) expect(axis.values.length).toBeGreaterThan(0);
  }
});

test("a game the gate cannot reach is named with what would cover it", () => {
  for (const gap of GAPS) {
    expect(gap.reason.length).toBeGreaterThan(40);
    expect(gap.instead.length).toBeGreaterThan(40);
  }
});

test("the gate fails on a decoder that carries its own copy of a list", () => {
  // The Brightway shape, reproduced on purpose: a three-value copy of a five-value type refuses two
  // legal saves. The gate must name them instead of passing.
  const gate = REGISTERED.find((candidate) => candidate.game === "brightway-park")!;
  const phase = gate.axes.find((axis) => axis.field === "guests[].state.phase")!;
  const stale = ["seeking", "busy", "leaving"];
  const failures = checkSaveStates({
    game: "probe",
    base: gate.base,
    axes: [
      {
        ...phase,
        decode: (raw) => (stale.includes(phase.read(JSON.parse(raw)) as string) ? JSON.parse(raw) : null),
      },
    ],
  });
  expect(failures.map((failure) => failure.value)).toEqual(["queued", "riding"]);
  expect(`${failures[0]!.game} ${failures[0]!.field}`).toBe("probe guests[].state.phase");
  expect(RULE).toContain("never from a second hand-written list");
});
