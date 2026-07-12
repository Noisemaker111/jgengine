import { describe, expect, test } from "bun:test";
import {
  colliderBounds,
  defaultEntityColliders,
  defaultObjectColliders,
  resolveColliders,
  worldOffset,
} from "@jgengine/core/scene/colliders";

describe("colliders", () => {
  test("default entity set is a non-blocking body-covering damage box", () => {
    const resolved = resolveColliders(defaultEntityColliders());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("damage");
    expect(resolved[0]!.damageEligible).toBe(true);
    expect(resolved[0]!.blocks).toBe(false);
    const bounds = colliderBounds(resolved[0]!, [0, 0, 0], 0);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(1.8);
  });

  test("default object set is a blocking physical AABB", () => {
    const resolved = resolveColliders(defaultObjectColliders());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("physical");
    expect(resolved[0]!.damageEligible).toBe(false);
    expect(resolved[0]!.blocks).toBe(true);
  });

  test("resolveColliders merges body and named hitboxes with purpose defaults", () => {
    const resolved = resolveColliders({
      body: { name: "hull", purpose: "physical", shape: { kind: "aabb", halfExtents: [1, 1, 1] } },
      hitboxes: [
        { name: "head", purpose: "damage", shape: { kind: "sphere", radius: 0.3, offset: [0, 1.6, 0] } },
        { name: "torso", purpose: "damage", shape: { kind: "aabb", halfExtents: [0.4, 0.6, 0.25] }, blocks: true },
      ],
    });
    expect(resolved.map((c) => c.name)).toEqual(["hull", "head", "torso"]);
    expect(resolved[0]!.blocks).toBe(true);
    expect(resolved[0]!.damageEligible).toBe(false);
    expect(resolved[1]!.blocks).toBe(false);
    expect(resolved[1]!.damageEligible).toBe(true);
    expect(resolved[2]!.blocks).toBe(true);
  });

  test("worldOffset rotates local offsets by yaw", () => {
    const world = worldOffset([1, 0, 0], [0, 0, 0], Math.PI / 2);
    expect(world[0]).toBeCloseTo(0);
    expect(world[1]).toBe(0);
    expect(world[2]).toBeCloseTo(-1);
  });

  test("colliderBounds expands spheres and aabbs around the world center", () => {
    const sphere = resolveColliders({
      hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 2, offset: [0, 1, 0] } }],
    })[0]!;
    const bounds = colliderBounds(sphere, [10, 0, 0], 0);
    expect(bounds.min).toEqual([8, -1, -2]);
    expect(bounds.max).toEqual([12, 3, 2]);
  });
});
