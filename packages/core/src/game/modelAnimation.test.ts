import { describe, expect, test } from "bun:test";

import { resolveOneShotClip } from "./modelAnimation";

describe("resolveOneShotClip", () => {
  const bindings = { hit: "Hit_A", death: "Death_A", attack: ["Swing_A", "Swing_B", "Swing_C"] };

  test("returns null for an unbound event or undefined map", () => {
    expect(resolveOneShotClip(bindings, "cast", 0)).toBeNull();
    expect(resolveOneShotClip(undefined, "hit", 0)).toBeNull();
  });

  test("returns a string binding directly", () => {
    expect(resolveOneShotClip(bindings, "hit", 0.9)).toBe("Hit_A");
    expect(resolveOneShotClip(bindings, "death", 0.1)).toBe("Death_A");
  });

  test("picks a variant across the roll range for an array binding", () => {
    expect(resolveOneShotClip(bindings, "attack", 0)).toBe("Swing_A");
    expect(resolveOneShotClip(bindings, "attack", 0.5)).toBe("Swing_B");
    expect(resolveOneShotClip(bindings, "attack", 0.99)).toBe("Swing_C");
  });

  test("clamps a roll of exactly 1 to the last variant", () => {
    expect(resolveOneShotClip(bindings, "attack", 1)).toBe("Swing_C");
  });

  test("an empty array binding is null", () => {
    expect(resolveOneShotClip({ attack: [] }, "attack", 0.5)).toBeNull();
  });
});
