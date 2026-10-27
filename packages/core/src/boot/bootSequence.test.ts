import { describe, expect, test } from "bun:test";

import { bootSequenceErrors, createBootSequence, formatBootSequence, parseBootSequence } from "./bootSequence";

describe("boot sequence", () => {
  test("moves forward through the screens, skipping the ones a game does not need", () => {
    const boot = createBootSequence();
    expect(boot.enter("loading")).toBe(true);
    expect(boot.enter("loading")).toBe(true);
    expect(boot.enter("menu")).toBe(true);
    expect(boot.enter("playing")).toBe(true);
    expect(boot.snapshot()).toEqual({ history: ["open", "loading", "menu", "playing"], refused: [] });
    expect(boot.done()).toBe(true);
  });

  test("refuses a second loading screen once the menu showed, and records it", () => {
    const boot = createBootSequence();
    boot.enter("loading");
    boot.enter("menu");
    expect(boot.enter("loading", "presentation suspended")).toBe(false);
    expect(boot.step()).toBe("menu");
    expect(boot.snapshot().refused).toEqual(["menu -> loading (presentation suspended)"]);
  });

  test("stamps every change for a page check and survives a round trip", () => {
    const stamps: string[] = [];
    const boot = createBootSequence((state) => stamps.push(formatBootSequence(state)));
    boot.enter("loading");
    boot.enter("entering");
    boot.fault("world hid to load");
    expect(stamps.at(-1)).toBe("open>loading>entering|entering: world hid to load");
    expect(parseBootSequence(stamps.at(-1)!)).toEqual(boot.snapshot());
    boot.reset();
    expect(boot.snapshot()).toEqual({ history: ["open"], refused: [] });
  });
});

describe("bootSequenceErrors", () => {
  test("passes each screen once, in order", () => {
    expect(bootSequenceErrors(["open", "loading", "intro", "menu", "entering", "playing"])).toEqual([]);
    expect(bootSequenceErrors(["open", "menu", "playing"])).toEqual([]);
  });

  test("fails a repeat, an out-of-order step, an unknown step and a refused request", () => {
    expect(bootSequenceErrors(["open", "loading", "menu", "loading", "menu"])).toEqual(["loading showed twice", "menu showed twice"]);
    expect(bootSequenceErrors(["open", "menu", "intro"])).toEqual(["intro showed after menu"]);
    expect(bootSequenceErrors(["open", "splash"])).toEqual(["splash is not a boot screen"]);
    expect(bootSequenceErrors(["loading"])).toEqual(["the boot must start at open, not loading"]);
    expect(bootSequenceErrors(["open", "menu"], ["menu -> loading"])).toEqual(["refused: menu -> loading"]);
  });
});
