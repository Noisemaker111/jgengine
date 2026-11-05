import { describe, expect, test } from "bun:test";

import { createShownGate } from "./shown";

describe("createShownGate", () => {
  test("a demo runs only while it is on screen in a visible tab", () => {
    const flips: boolean[] = [];
    const gate = createShownGate((shown) => flips.push(shown));
    expect(gate.shown()).toBe(true);
    gate.setOnScreen(false);
    expect(gate.shown()).toBe(false);
    gate.setTabHidden(true);
    gate.setOnScreen(true);
    expect(gate.shown()).toBe(false);
    gate.setTabHidden(false);
    expect(gate.shown()).toBe(true);
    expect(flips).toEqual([false, true]);
  });

  test("a page opened in a background tab starts paused", () => {
    const gate = createShownGate(() => {}, true);
    expect(gate.shown()).toBe(false);
  });
});
