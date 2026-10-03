import { describe, expect, test } from "bun:test";

import { runPhysicsBackendConformance } from "./physicsBackendConformance";
import { createPhysicsWorldBackend } from "./physicsWorldBackend";

function create() {
  return createPhysicsWorldBackend({
    capacity: 64,
    bounds: { min: [-60, -5, -60], max: [60, 60, 60] },
    warn: false,
  });
}

describe("createPhysicsWorldBackend", () => {
  runPhysicsBackendConformance(create, { test, expect });

  test("capsules collide as their bounding box and rotation is ignored", () => {
    const backend = create();
    const handle = backend.addBody({
      shape: { kind: "capsule", radius: 0.4, halfHeight: 0.5 },
      position: [0, 1, 0],
      rotation: [0, 0.7071, 0, 0.7071],
      kind: "static",
    });
    expect(backend.body(handle)!.rotation).toEqual([0, 0, 0, 1]);
    const hit = backend.raycast({ origin: [3, 1, 0], direction: [-1, 0, 0], maxDistance: 5 });
    expect(hit!.distance).toBeCloseTo(2.6, 3);
    expect(backend.capabilities.rotation).toBe(false);
  });

  test("machine-scale floor touch allows separating and tangent casts at translated coordinates", () => {
    for (const offset of [0, 100, -100]) {
      const backend = create();
      backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.5, 5] }, position: [0, offset - 0.5, 0], kind: "static" });
      const shape = { kind: "capsule" as const, radius: 0.3, halfHeight: 0.6000000000000001 };
      const top = offset + shape.halfHeight + shape.radius;
      const position = [0, top - Number.EPSILON * Math.max(1, Math.abs(top)), 0] as const;
      expect(backend.shapecast({ shape, position, motion: [0, 0.1, 0] })).toBeNull();
      expect(backend.shapecast({ shape, position, motion: [0.1, 0, 0] })).toBeNull();
      expect(backend.shapecast({ shape, position, motion: [0, -0.1, 0] })!.normal).toEqual([0, 1, 0]);
      expect(backend.shapecast({ shape, position: [0, top - 1e-8, 0], motion: [0, 0.1, 0] })!.toi).toBe(0);
    }
  });

  test("separating from floor touch still finds a wall and a ceiling", () => {
    const backend = create();
    backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.5, 5] }, position: [0, -0.5, 0], kind: "static" });
    const wall = backend.addBody({ shape: { kind: "box", halfExtents: [0.2, 2, 5] }, position: [1, 2, 0], kind: "static" });
    const ceiling = backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.1, 5] }, position: [0, 2.1, 0], kind: "static" });
    const shape = { kind: "capsule" as const, radius: 0.3, halfHeight: 0.6000000000000001 };
    expect(backend.shapecast({ shape, position: [0, 0.9, 0], motion: [1, 0, 0] })!.body).toBe(wall);
    expect(backend.shapecast({ shape, position: [0, 0.9, 0], motion: [0, 1, 0] })!.body).toBe(ceiling);
  });

  test("overlap excludes machine-scale touch but retains real penetration at translated coordinates", () => {
    for (const offset of [0, 100, -100]) {
      const backend = create();
      const floor = backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.5, 5] }, position: [0, offset - 0.5, 0], kind: "static" });
      const shape = { kind: "capsule" as const, radius: 0.3, halfHeight: 0.6000000000000001 };
      const top = offset + shape.halfHeight + shape.radius;
      expect(backend.overlap({ shape, position: [0, top - Number.EPSILON * Math.max(1, Math.abs(top)), 0] })).toEqual([]);
      expect(backend.overlap({ shape, position: [0, top - 1e-8, 0] })).toEqual([floor]);
    }
  });

  test("removing a body drops joints attached to it", () => {
    const backend = create();
    const a = backend.addBody({ shape: { kind: "sphere", radius: 0.2 }, position: [0, 2, 0] });
    const b = backend.addBody({ shape: { kind: "sphere", radius: 0.2 }, position: [1, 2, 0] });
    const joint = backend.addJoint({ kind: "distance", bodyA: a, bodyB: b, restLength: 1 });
    backend.removeBody(a);
    backend.removeJoint(joint);
    expect(backend.hasBody(b)).toBe(true);
  });
});
