import { describe, expect, test } from "bun:test";

import { DECAL_DEFAULTS, readDecalRules, resolveDecalObject } from "./decalKind";

describe("decal kind", () => {
  test("defaults and clamps authored meta", () => {
    const rules = readDecalRules(undefined);
    expect(rules.style).toBe(DECAL_DEFAULTS.style);
    expect(rules.size).toBe(DECAL_DEFAULTS.size);
    expect(readDecalRules({ style: "blood", size: 100, tilt: -5, opacity: 0 }).style).toBe("blood");
    expect(readDecalRules({ size: 100 }).size).toBe(24);
    expect(readDecalRules({ tilt: -5 }).tilt).toBe(0);
    expect(readDecalRules({ opacity: 0 }).opacity).toBe(0.05);
    expect(readDecalRules({ style: "glitter" }).style).toBe(DECAL_DEFAULTS.style);
  });

  test("resolves a placed marker with its facing and rules", () => {
    const resolved = resolveDecalObject({
      id: "wall-stain",
      kind: "decal",
      position: { x: 2, y: 1, z: -3 },
      rotationY: 1.2,
      meta: { style: "cracks", tilt: 90, lift: 2.1, size: 1.8 },
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.position).toEqual([2, 1, -3]);
    expect(resolved!.rotationY).toBe(1.2);
    expect(resolved!.rules.tilt).toBe(90);
    expect(resolved!.rules.style).toBe("cracks");
    expect(resolveDecalObject({ id: "x", kind: "decal" })).toBeNull();
  });
});
