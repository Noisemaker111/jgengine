import { describe, expect, test } from "bun:test";
import {
  controlGroupKey,
  resolveControlGroupIntent,
} from "@jgengine/core/input/controlGroups";

describe("controlGroupKey", () => {
  test("builds a bare digit key by default and honors a prefix", () => {
    expect(controlGroupKey(3)).toBe("3");
    expect(controlGroupKey(3, { keyPrefix: "group:" })).toBe("group:3");
  });

  test("rejects out-of-range digits", () => {
    expect(() => controlGroupKey(10)).toThrow();
    expect(() => controlGroupKey(-1)).toThrow();
    expect(() => controlGroupKey(1.5)).toThrow();
  });
});

describe("resolveControlGroupIntent", () => {
  test("Ctrl+digit resolves to a bind", () => {
    const intent = resolveControlGroupIntent({ digit: 1, bindModifier: true, now: 100, lastRecall: null });
    expect(intent).toEqual({ kind: "bind", key: "1" });
  });

  test("a bare digit with no prior recall resolves to recall", () => {
    const intent = resolveControlGroupIntent({ digit: 2, bindModifier: false, now: 100, lastRecall: null });
    expect(intent).toEqual({ kind: "recall", key: "2" });
  });

  test("a second recall of the same group within the window resolves to focus", () => {
    const intent = resolveControlGroupIntent({
      digit: 2,
      bindModifier: false,
      now: 250,
      lastRecall: { key: "2", at: 100 },
    });
    expect(intent).toEqual({ kind: "focus", key: "2" });
  });

  test("a slow second tap or a different group stays a recall", () => {
    const tooSlow = resolveControlGroupIntent({
      digit: 2,
      bindModifier: false,
      now: 500,
      lastRecall: { key: "2", at: 100 },
    });
    expect(tooSlow.kind).toBe("recall");

    const otherGroup = resolveControlGroupIntent({
      digit: 3,
      bindModifier: false,
      now: 150,
      lastRecall: { key: "2", at: 100 },
    });
    expect(otherGroup).toEqual({ kind: "recall", key: "3" });
  });

  test("double-tap window and key prefix are configurable together", () => {
    const intent = resolveControlGroupIntent(
      { digit: 1, bindModifier: false, now: 900, lastRecall: { key: "cg:1", at: 400 } },
      { doubleTapMs: 600, keyPrefix: "cg:" },
    );
    expect(intent).toEqual({ kind: "focus", key: "cg:1" });
  });
});
