import { describe, expect, test } from "bun:test";
import { DEFAULT_EYE_HEIGHT, resolveShot } from "@jgengine/core/combat/shotOrigin";

describe("resolveShot", () => {
  const deps = {
    positionOf: (id: string) => (id === "hero" ? ([1, 0, 2] as const) : undefined),
    rotationYOf: (id: string) => (id === "hero" ? Math.PI / 2 : undefined),
  };

  test("default eye policy raises yaw/pitch aim to eye height", () => {
    const shot = resolveShot(deps, "hero", { yaw: 0, pitch: 0 });
    expect(shot?.origin).toEqual([1, DEFAULT_EYE_HEIGHT, 2]);
    expect(shot?.direction[2]).toBeCloseTo(1);
  });

  test("eye policy honors explicit aim.origin and custom height", () => {
    const explicit = resolveShot(deps, "hero", { origin: [0, 1, 0], direction: [0, 0, 1] }, { kind: "eye" });
    expect(explicit?.origin).toEqual([0, 1, 0]);
    const short = resolveShot(deps, "hero", { yaw: 0, pitch: 0 }, { kind: "eye", height: 0.8 });
    expect(short?.origin).toEqual([1, 0.8, 2]);
  });

  test("eye policy sizes height from the shooter's hitbox when colliders are known", () => {
    const withColliders = {
      ...deps,
      collidersOf: () => ({
        hitboxes: [
          {
            name: "body",
            purpose: "damage" as const,
            shape: { kind: "aabb" as const, halfExtents: [1, 2, 1] as const, offset: [0, 2, 0] as const },
          },
        ],
      }),
    };
    const shot = resolveShot(withColliders, "hero", { yaw: 0, pitch: 0 });
    expect(shot?.origin[1]).toBeCloseTo(4 * 0.9);
  });

  test("legacy uses aim.origin when present", () => {
    const shot = resolveShot(deps, "hero", { origin: [0, 1, 0], direction: [0, 0, 1] }, { kind: "legacy" });
    expect(shot?.origin).toEqual([0, 1, 0]);
    expect(shot?.direction[2]).toBeCloseTo(1);
  });

  test("legacy falls back to entity position for yaw/pitch aim", () => {
    const shot = resolveShot(deps, "hero", { yaw: 0, pitch: 0 }, { kind: "legacy" });
    expect(shot?.origin).toEqual([1, 0, 2]);
  });

  test("entity policy ignores aim.origin", () => {
    const shot = resolveShot(
      deps,
      "hero",
      { origin: [9, 9, 9], direction: [0, 0, 1] },
      { kind: "entity" },
    );
    expect(shot?.origin).toEqual([1, 0, 2]);
  });

  test("muzzle applies default local offset rotated by yaw", () => {
    const shot = resolveShot(deps, "hero", { yaw: 0, pitch: 0 }, { kind: "muzzle" });
    expect(shot).not.toBeNull();
    expect(shot!.origin[1]).toBeCloseTo(1.4);
    expect(shot!.origin[0]).toBeCloseTo(1 + 0.35);
    expect(shot!.origin[2]).toBeCloseTo(2);
  });

  test("entityOffset rotates a custom local offset", () => {
    const shot = resolveShot(
      deps,
      "hero",
      { yaw: 0, pitch: 0 },
      { kind: "entityOffset", offset: [1, 0, 0] },
    );
    expect(shot!.origin[0]).toBeCloseTo(1);
    expect(shot!.origin[2]).toBeCloseTo(2 - 1);
  });

  test("camera and world policies use explicit origin", () => {
    const camera = resolveShot(
      deps,
      "hero",
      { yaw: 0, pitch: 0 },
      { kind: "camera", origin: [3, 4, 5], direction: [1, 0, 0] },
    );
    expect(camera?.origin).toEqual([3, 4, 5]);
    expect(camera?.direction[0]).toBeCloseTo(1);

    const world = resolveShot(
      deps,
      "hero",
      { origin: [0, 0, 0], direction: [0, 1, 0] },
      { kind: "world", origin: [7, 8, 9] },
    );
    expect(world?.origin).toEqual([7, 8, 9]);
  });
});
