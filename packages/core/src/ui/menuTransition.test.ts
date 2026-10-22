import { describe, expect, test } from "bun:test";

import { createMenuTransition, menuTransitionDurations, menuTransitionPhaseMs } from "@jgengine/core/ui/menuTransition";

describe("menuTransitionDurations", () => {
  test("defaults to a 220ms enter and 160ms exit", () => {
    expect(menuTransitionDurations()).toEqual({ enter: 220, exit: 160 });
  });

  test("reduced motion collapses both durations to zero", () => {
    expect(menuTransitionDurations({ reducedMotion: true })).toEqual({ enter: 0, exit: 0 });
  });

  test("phase duration is zero while open or closed", () => {
    expect(menuTransitionPhaseMs("open")).toBe(0);
    expect(menuTransitionPhaseMs("closed")).toBe(0);
    expect(menuTransitionPhaseMs("enter", { enterMs: 90 })).toBe(90);
  });
});

describe("createMenuTransition", () => {
  test("walks closed -> enter -> open -> exit -> closed on the injected clock", () => {
    const transition = createMenuTransition({ enterMs: 200, exitMs: 100 });
    expect(transition.state().phase).toBe("closed");
    transition.open(0);
    expect(transition.state().phase).toBe("enter");
    expect(transition.tick(120).phase).toBe("enter");
    expect(transition.tick(200).phase).toBe("open");
    transition.close(300);
    expect(transition.state().phase).toBe("exit");
    expect(transition.tick(350).phase).toBe("exit");
    expect(transition.tick(400).phase).toBe("closed");
  });

  test("reduced motion goes straight to open and straight to closed", () => {
    const transition = createMenuTransition({ reducedMotion: true });
    transition.open(0);
    expect(transition.state().phase).toBe("open");
    transition.close(10);
    expect(transition.state().phase).toBe("closed");
  });

  test("open/close are idempotent and notify once per real change", () => {
    const transition = createMenuTransition({ enterMs: 100 });
    let changes = 0;
    transition.subscribe(() => (changes += 1));
    transition.open(0);
    transition.open(10);
    expect(changes).toBe(1);
    transition.tick(100);
    expect(changes).toBe(2);
    transition.tick(200);
    expect(changes).toBe(2);
  });

  test("snapshot/restore round-trips the phase", () => {
    const transition = createMenuTransition({ enterMs: 100 });
    transition.open(5);
    const snapshot = transition.snapshot();
    const copy = createMenuTransition({ enterMs: 100 });
    copy.restore(snapshot);
    expect(copy.state()).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
