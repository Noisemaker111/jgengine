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
