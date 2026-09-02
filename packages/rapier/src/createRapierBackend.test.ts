import { describe, expect, test } from "bun:test";

import { runPhysicsBackendConformance } from "@jgengine/core/physics/physicsBackendConformance";
import { createCharacterController } from "@jgengine/core/movement/characterController";
import { createRapierBackend } from "./rapierBackend";

function create() {
  return createRapierBackend();
}

function world() {
  return create().then((backend) => {
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    return backend;
  });
}

function controller() {
  const c = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0.4 });
  c.restore({ position: [0, 0, 0], verticalVelocity: 0, grounded: false, groundNormal: [0, 1, 0], groundBody: null, crouching: false });
  return c;
}

describe("createRapierBackend", () => {
  test("matches the shared physics backend contract", async () => {
    let current: Awaited<ReturnType<typeof create>> | undefined;
    const cases: Array<[string, () => void]> = [];
    runPhysicsBackendConformance(() => {
      if (!current) throw new Error("conformance backend missing");
      return current;
    }, { test: (name, run) => cases.push([name, run]), expect });
    for (const [name, run] of cases) {
      current = await create();
      try { run(); } catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
      current.dispose();
    }
  });

  test("character controller lands and walks", async () => {
    const backend = await world();
    const c = controller();
    c.restore({ ...c.snapshot(), position: [0, 1, 0] });
    for (let i = 0; i < 60; i += 1) c.move(backend, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
    expect(c.state().grounded).toBe(true);
    expect(c.state().position[1]).toBeCloseTo(0, 1);
    expect(c.move(backend, { motion: [0.1, 0, 0], dt: 1 / 60, gravity: 20 }).moved[0]).toBeCloseTo(0.1, 5);
  });

  test("character controller slides, steps, jumps, crouches, and rides platforms", async () => {
    const backend = await world();
    backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 2, 5] }, position: [2, 2, 0], kind: "static" });
    const c = controller();
    for (let i = 0; i < 40; i += 1) c.move(backend, { motion: [0.2, 0, 0.1], dt: 1 / 60, gravity: 20 });
    expect(c.state().position[0]).toBeLessThan(1.151);
    expect(c.state().position[2]).toBeGreaterThan(2);

    const ledge = await world();
    ledge.addBody({ shape: { kind: "box", halfExtents: [1, 0.15, 3] }, position: [2, 0.15, 0], kind: "static" });
    ledge.addBody({ shape: { kind: "box", halfExtents: [1, 0.6, 3] }, position: [5, 0.6, 0], kind: "static" });
    const stepped = controller();
    let steppedUp = false;
    for (let i = 0; i < 120; i += 1) {
      const result = stepped.move(ledge, { motion: [0.05, 0, 0], dt: 1 / 60, gravity: 20 });
      steppedUp ||= result.steppedUp;
    }
    expect(steppedUp).toBe(true);
    expect(stepped.state().position[0]).toBeGreaterThan(3.5);

    const ceiling = await world();
    ceiling.addBody({ shape: { kind: "box", halfExtents: [3, 0.1, 3] }, position: [0, 2.6, 0], kind: "static" });
    const jumper = controller();
    jumper.move(ceiling, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 });
    let hitCeiling = false;
    for (let i = 0; i < 90; i += 1) hitCeiling ||= jumper.move(ceiling, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20, ...(i === 0 ? { jumpVelocity: 8 } : {}) }).hitCeiling;
    expect(hitCeiling).toBe(true);

    const platformWorld = await world();
    const platform = platformWorld.addBody({ shape: { kind: "box", halfExtents: [1.5, 0.2, 1.5] }, position: [0, 1, 0], kind: "kinematic" });
    const rider = controller();
    rider.restore({ ...rider.snapshot(), position: [0, 1.5, 0] });
    for (let i = 0; i < 30; i += 1) { rider.move(platformWorld, { motion: [0, 0, 0], dt: 1 / 60, gravity: 20 }); platformWorld.step(1 / 60); }
    expect(rider.state().groundBody).toBe(platform);
  });
});
