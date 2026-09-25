import { describe, expect, test } from "bun:test";
import { emptyPadHapticState, stepPadHaptics } from "./padHaptics";

describe("stepPadHaptics", () => {
  test("plays on change, refreshes a held level, resets when silent", () => {
    const state = emptyPadHapticState();
    expect(stepPadHaptics(state, { strong: 0, weak: 0 }, 0)).toBeNull();
    expect(stepPadHaptics(state, { strong: 0.5, weak: 0.2 }, 0)).toBe("play");
    expect(stepPadHaptics(state, { strong: 0.51, weak: 0.2 }, 16)).toBeNull();
    expect(stepPadHaptics(state, { strong: 0.7, weak: 0.2 }, 32)).toBe("play");
    expect(stepPadHaptics(state, { strong: 0.7, weak: 0.2 }, 100)).toBeNull();
    expect(stepPadHaptics(state, { strong: 0.7, weak: 0.2 }, 120)).toBe("play");
    expect(stepPadHaptics(state, { strong: 0, weak: 0 }, 136)).toBe("reset");
    expect(stepPadHaptics(state, { strong: 0, weak: 0 }, 152)).toBeNull();
  });
});
