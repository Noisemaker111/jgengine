import type { PhysicsBackend } from "./physicsBackend";

/** The slice of a test runner the conformance suite needs; `bun:test` satisfies it directly. */
export interface ConformanceHarness {
  test(name: string, run: () => void): void;
  expect(value: unknown): {
    toBe(expected: unknown): void;
    toBeNull(): void;
    not: { toBeNull(): void; toBe(expected: unknown): void };
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeCloseTo(expected: number, digits?: number): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
  };
}

/**
 * Behavioral contract every {@link PhysicsBackend} must pass: bodies rest on floors, casts and rays report the
 * first surface with an outward normal, kinematic targets produce velocity, masks filter, and snapshot/restore
 * round-trips with stable handles. Backends declare what they cannot do through `capabilities`; the suite reads it.
 * Expects `create()` to return a fresh backend whose world spans at least ±50 on every axis with a floor at y=0.
 *
 * @capability physics-backend-conformance the shared test contract a physics adapter runs to prove it matches the seam
 */
export function runPhysicsBackendConformance(create: () => PhysicsBackend, harness: ConformanceHarness): void {
  const { test, expect } = harness;

  function settle(backend: PhysicsBackend, seconds: number): void {
    const steps = Math.ceil(seconds * 60);
    for (let i = 0; i < steps; i += 1) backend.step(1 / 60);
  }

  function floor(backend: PhysicsBackend) {
    return backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
  }

  test("handles are unique, readable, and removable", () => {
    const backend = create();
    const a = backend.addBody({ shape: { kind: "sphere", radius: 0.5 }, position: [1, 2, 3], userData: "a" });
    const b = backend.addBody({ shape: { kind: "box", halfExtents: [1, 1, 1] }, position: [4, 5, 6] });
    expect(a).not.toBe(b);
    expect(backend.body(a)?.position).toEqual([1, 2, 3]);
    expect(backend.userDataOf(a)).toBe("a");
    backend.removeBody(a);
    expect(backend.hasBody(a)).toBe(false);
    expect(backend.body(a)).toBeNull();
    expect(backend.hasBody(b)).toBe(true);
  });

  test("a dynamic box falls onto a static floor and rests", () => {
    const backend = create();
    floor(backend);
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 4, 0] });
    settle(backend, 3);
    const state = backend.body(crate)!;
    expect(state.position[1]).toBeGreaterThan(0.4);
    expect(state.position[1]).toBeLessThan(0.7);
    expect(Math.abs(state.velocity[1])).toBeLessThan(0.5);
  });

  test("raycast reports the floor with an upward normal and the right distance", () => {
    const backend = create();
    const ground = floor(backend);
    const hit = backend.raycast({ origin: [0, 3, 0], direction: [0, -1, 0], maxDistance: 10 });
    expect(hit).not.toBeNull();
    expect(hit!.body).toBe(ground);
    expect(hit!.distance).toBeCloseTo(3, 3);
    expect(hit!.normal[1]).toBeCloseTo(1, 3);
    expect(backend.raycast({ origin: [0, 3, 0], direction: [0, -1, 0], maxDistance: 1 })).toBeNull();
  });

  test("shapecast stops at a wall with a normal facing the mover", () => {
    const backend = create();
    backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 2, 5] }, position: [5, 2, 0], kind: "static" });
    const hit = backend.shapecast({
      shape: { kind: "capsule", radius: 0.4, halfHeight: 0.5 },
      position: [0, 1, 0],
      motion: [10, 0, 0],
    });
    expect(hit).not.toBeNull();
    expect(hit!.toi).toBeGreaterThan(0.3);
    expect(hit!.toi).toBeLessThan(0.5);
    expect(hit!.normal[0]).toBeCloseTo(-1, 3);
    expect(backend.shapecast({ shape: { kind: "sphere", radius: 0.4 }, position: [0, 1, 0], motion: [2, 0, 0] })).toBeNull();
  });

  test("overlap finds bodies at a point and nowhere else", () => {
    const backend = create();
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 0.5, 0], kind: "static" });
    expect(backend.overlap({ shape: { kind: "sphere", radius: 0.2 }, position: [0.3, 0.5, 0] })).toContain(crate);
    expect(backend.overlap({ shape: { kind: "sphere", radius: 0.2 }, position: [3, 0.5, 0] })).toEqual([]);
  });

  test("layer masks filter rays and casts", () => {
    const backend = create();
    backend.addBody({ shape: { kind: "box", halfExtents: [1, 1, 1] }, position: [0, 1, 0], kind: "static", layers: 2 });
    expect(backend.raycast({ origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 10, mask: 1 })).toBeNull();
    expect(backend.raycast({ origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 10, mask: 2 })).not.toBeNull();
  });

  test("a kinematic target moves the body and reports its velocity", () => {
    const backend = create();
    const platform = backend.addBody({ shape: { kind: "box", halfExtents: [2, 0.25, 2] }, position: [0, 1, 0], kind: "kinematic" });
    backend.setKinematicTarget(platform, [0.5, 1, 0]);
    backend.step(1 / 60);
    const state = backend.body(platform)!;
    expect(state.position[0]).toBeCloseTo(0.5, 3);
    expect(state.velocity[0]).toBeGreaterThan(20);
  });

  test("contacts are reported when a body lands", () => {
    const backend = create();
    const ground = floor(backend);
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 3, 0] });
    const pairs: string[] = [];
    backend.onContact((event) => {
      pairs.push([event.a, event.b].sort((x, y) => x - y).join(":"));
    });
    settle(backend, 2);
    expect(pairs).toContain([ground, crate].sort((x, y) => x - y).join(":"));
  });

  test("snapshot and restore round-trip state with stable handles", () => {
    const backend = create();
    floor(backend);
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 5, 0] });
    settle(backend, 0.5);
    const saved = backend.snapshot();
    const at = backend.body(crate)!.position[1];
    settle(backend, 1);
    expect(backend.body(crate)!.position[1]).not.toBe(at);
    backend.restore(saved);
    expect(backend.hasBody(crate)).toBe(true);
    expect(backend.body(crate)!.position[1]).toBeCloseTo(at, 5);
    const later = backend.addBody({ shape: { kind: "sphere", radius: 0.3 }, position: [2, 2, 2] });
    expect(later).not.toBe(crate);
  });

  test("capabilities describe the backend", () => {
    const backend = create();
    expect(backend.capabilities.shapes.length).toBeGreaterThan(1);
    expect(typeof backend.capabilities.rotation).toBe("boolean");
  });
}
