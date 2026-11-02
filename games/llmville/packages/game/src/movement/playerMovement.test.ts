import { describe, expect, test } from "bun:test";
import { standingStep } from "@llmville/game/movement/playerMovement";

describe("standingStep", () => {
  test("accepts a step through open space", () => {
    expect(standingStep([4, 0, 4], [4.5, 0, 3.75], [])).toBeUndefined();
  });

  test("blocks a step into a structural column", () => {
    expect(standingStep([1.6, 0, 0.5], [1.4, 0, 0.5], [])).toEqual([1.6, 0, 0.5]);
  });

  test("allows a step that stays clear of the column lattice", () => {
    expect(standingStep([2.5, 0, 0.5], [2.1, 0, 0.5], [])).toBeUndefined();
  });

  test("keeps the open axis when one axis walks into a column", () => {
    expect(standingStep([1.6, 0, 0.5], [1.4, 0, 0.7], [])).toEqual([1.6, 0, 0.7]);
  });

  test("blocks a step that overlaps another player", () => {
    expect(standingStep([2, 0, 4], [1.5, 0, 4], [{ x: 1.5, z: 4 }])).toEqual([2, 0, 4]);
  });

  test("allows a step that stops short of another player", () => {
    expect(standingStep([4, 0, 4], [3.9, 0, 4], [{ x: 2, z: 4 }])).toBeUndefined();
  });

  test("keeps the jump height of a blocked step", () => {
    expect(standingStep([1.6, 0.2, 0.5], [1.4, 0.3, 0.5], [])).toEqual([1.6, 0.3, 0.5]);
  });
});
