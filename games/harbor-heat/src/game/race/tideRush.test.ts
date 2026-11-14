import { describe, expect, test } from "bun:test";
import { CIRCUIT_ORDER, openCircuits } from "./tideRush";

describe("the Tide Rush ladder", () => {
  test("the Ocean Loop is open from the start and each first win opens the next circuit", () => {
    expect(openCircuits([])).toEqual(["race-loop"]);
    expect(openCircuits(["race-loop"])).toEqual(["race-loop", "race-harbor"]);
    expect(openCircuits(["race-loop", "race-harbor", "race-heights"])).toEqual([...CIRCUIT_ORDER]);
    // A win out of order (a gig street race) opens nothing it has not earned.
    expect(openCircuits(["race-heights"])).toEqual(["race-loop"]);
  });
});
