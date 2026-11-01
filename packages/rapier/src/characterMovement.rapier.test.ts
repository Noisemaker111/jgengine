import { describe, expect, test } from "bun:test";

import { createCharacterController } from "@jgengine/core/movement/characterController";
import { createRapierBackend } from "./rapierBackend";

const DT = 1 / 60;

describe("Rapier character surfaces", () => {
  test("walks up a walkable imported collider slope", async () => {
    const backend = await createRapierBackend();
    try {
      const angle = 20 * Math.PI / 180;
      backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.2, 3] }, position: [10, 2, 0], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], kind: "static" });
      const controller = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0, maxSlopeDeg: 50 });
      controller.restore({ ...controller.snapshot(), position: [8, 2 - 2 * Math.tan(angle) + 0.2 / Math.cos(angle) + 0.04, 0] });
      for (let i = 0; i < 10; i++) controller.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20 });
      const startY = controller.state().position[1];
      const surface = backend.shapecast({ shape: { kind: "sphere", radius: 0.1 }, position: [10, 4, 0], motion: [0, -3, 0] });
      if (surface === null) throw new Error("the slope is under the probe");
      expect(surface.point[0]).toBeGreaterThan(9);
      expect(surface.normal[0]).toBeCloseTo(-Math.sin(angle), 3);
      expect(surface.normal[1]).toBeCloseTo(Math.cos(angle), 3);
      for (let i = 0; i < 60; i++) controller.move(backend, { motion: [0.06, 0, 0], dt: DT, gravity: 20 });
      expect(controller.state().position[0]).toBeGreaterThan(10.5);
      expect(controller.state().position[1]).toBeGreaterThan(startY + 0.8);
      expect(controller.state().grounded).toBe(true);
    } finally { backend.dispose(); }
  });

  test("excluded character bodies cannot hide the wall ahead", async () => {
    const backend = await createRapierBackend();
    try {
      const shape = { kind: "capsule" as const, radius: 0.35, halfHeight: 0.55 };
      const self = backend.addBody({ shape, position: [0, 0.9, 0], kind: "kinematic" });
      const wall = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 2, 3] }, position: [2, 2, 0], kind: "static" });
      const hit = backend.shapecast({ shape, position: [0, 0.9, 0], motion: [3, 0, 0], exclude: self });
      expect(hit?.body).toBe(wall);
      expect(hit?.toi).toBeGreaterThan(0);
      expect(hit?.toi).toBeLessThan(1);
      expect(backend.raycast({ origin: [0, 0.9, 0], direction: [1, 0, 0], maxDistance: 3, exclude: self })?.body).toBe(wall);
    } finally { backend.dispose(); }
  });

  test("character exclusion preserves collision masks and sphere normals", async () => {
    const backend = await createRapierBackend();
    try {
      const shape = { kind: "capsule" as const, radius: 0.35, halfHeight: 0.55 };
      const self = backend.addBody({ shape, position: [0, 0.9, 0], kind: "kinematic" });
      backend.addBody({ shape: { kind: "box", halfExtents: [0.1, 2, 3] }, position: [1, 2, 0], kind: "static", layers: 4 });
      const wall = backend.addBody({ shape: { kind: "box", halfExtents: [0.2, 2, 3] }, position: [2, 2, 0], kind: "static", layers: 2 });
      expect(backend.shapecast({ shape, position: [0, 0.9, 0], motion: [3, 0, 0], exclude: self, mask: 2 })?.body).toBe(wall);
      expect(backend.raycast({ origin: [0, 0.9, 0], direction: [1, 0, 0], maxDistance: 3, exclude: self, mask: 2 })?.body).toBe(wall);
      const sphere = backend.addBody({ shape: { kind: "sphere", radius: 1 }, position: [0, 3, 5], kind: "static" });
      const hit = backend.shapecast({ shape: { kind: "sphere", radius: 0.1 }, position: [0, 6, 5], motion: [0, -4, 0] });
      expect(hit?.body).toBe(sphere);
      expect(hit?.normal[1]).toBeCloseTo(1, 4);
    } finally { backend.dispose(); }
  });

  test("slopes over the configured limit remain blocked", async () => {
    const backend = await createRapierBackend();
    try {
      const angle = 60 * Math.PI / 180;
      backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.2, 3] }, position: [0, 2, 0], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], kind: "static" });
      const controller = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0, maxSlopeDeg: 50 });
      controller.restore({ ...controller.snapshot(), position: [-1, 2 - Math.tan(angle) + 0.2 / Math.cos(angle) + 0.4, 0] });
      for (let i = 0; i < 40; i++) controller.move(backend, { motion: [0.06, 0, 0], dt: DT, gravity: 20 });
      expect(controller.state().position[0]).toBeLessThan(-0.9);
      expect(controller.state().grounded).toBe(false);
    } finally { backend.dispose(); }
  });

  test("short authored proportions land without placing the crouched capsule below its feet", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
      const controller = createCharacterController({ radius: 0.35, height: 0.8 });
      controller.restore({ ...controller.snapshot(), position: [0, 1, 0] });
      for (let i = 0; i < 60; i++) controller.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20, crouch: true });
      expect(controller.state().grounded).toBe(true);
      expect(controller.state().position[1]).toBeCloseTo(0.02, 4);
      const shape = controller.shape();
      if (shape.kind !== "capsule") throw new Error("expected capsule");
      expect(controller.center()[1] - shape.halfHeight - shape.radius).toBeCloseTo(controller.state().position[1], 8);
      controller.retune({ height: 1.8 });
      expect(controller.config().crouchHeight).toBeCloseTo(1.08, 8);
    } finally { backend.dispose(); }
  });

  test("airborne contact beside a ledge cannot step up", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
      backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.25, 3] }, position: [2, 0.25, 0], kind: "static" });
      const controller = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0.4 });
      controller.restore({ ...controller.snapshot(), position: [0.5, 0.2, 0], verticalVelocity: -0.1 });
      const result = controller.move(backend, { motion: [0.3, 0, 0], dt: DT, gravity: 20 });
      expect(result.steppedUp).toBe(false);
      expect(controller.state().position[1]).toBeLessThan(0.2);
    } finally { backend.dispose(); }
  });
});

describe("Rapier character controller behind backendMotion", () => {
  const floorDesc = { shape: { kind: "box" as const, halfExtents: [50, 0.5, 50] as const }, position: [0, -0.5, 0] as const, kind: "static" as const };

  test("lands, walks, and stops at a wall with Rapier's own mover", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody(floorDesc);
      const wall = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 2, 5] }, position: [3, 2, 0], kind: "static" });
      const controller = createCharacterController({ radius: 0.35, height: 1.8, backendMotion: true });
      controller.restore({ ...controller.snapshot(), position: [0, 1, 0] });
      for (let i = 0; i < 60; i++) controller.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20 });
      expect(controller.state().grounded).toBe(true);
      expect(controller.state().position[1]).toBeCloseTo(0, 1);
      let hitWall = false;
      for (let i = 0; i < 90; i++) {
        const moved = controller.move(backend, { motion: [0.1, 0, 0.02], dt: DT, gravity: 20 });
        hitWall ||= moved.hitWall;
      }
      expect(hitWall).toBe(true);
      expect(controller.state().position[0]).toBeLessThan(2.5 - 0.3);
      expect(controller.state().position[0]).toBeGreaterThan(2);
      expect(controller.state().position[2]).toBeGreaterThan(1);
      expect(backend.raycast({ origin: [0, 0.9, 0], direction: [1, 0, 0], maxDistance: 5 })?.body).toBe(wall);
    } finally { backend.dispose(); }
  });

  test("climbs a step and a walkable slope, and refuses a steep one", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody(floorDesc);
      backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.15, 3] }, position: [2, 0.15, 0], kind: "static" });
      const walker = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0.4, backendMotion: true });
      let onStep = 0;
      for (let i = 0; i < 50; i++) {
        walker.move(backend, { motion: [0.05, 0, 0], dt: DT, gravity: 20 });
        if (walker.state().position[0] > 1.5) onStep = Math.max(onStep, walker.state().position[1]);
      }
      expect(walker.state().position[0]).toBeGreaterThan(2);
      expect(onStep).toBeGreaterThan(0.28);
      expect(walker.state().grounded).toBe(true);

      const steep = 60 * Math.PI / 180;
      backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.2, 3] }, position: [0, 2, 20], rotation: [0, 0, Math.sin(steep / 2), Math.cos(steep / 2)], kind: "static" });
      const blocked = createCharacterController({ radius: 0.35, height: 1.8, stepHeight: 0, maxSlopeDeg: 50, backendMotion: true });
      blocked.restore({ ...blocked.snapshot(), position: [-3.5, 0.05, 20] });
      for (let i = 0; i < 60; i++) blocked.move(backend, { motion: [0.06, 0, 0], dt: DT, gravity: 20 });
      expect(blocked.state().position[1]).toBeLessThan(0.6);
    } finally { backend.dispose(); }
  });

  test("jumps, rides a platform, and frees the native mover on dispose", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody(floorDesc);
      const jumper = createCharacterController({ radius: 0.35, height: 1.8, backendMotion: true });
      for (let i = 0; i < 5; i++) jumper.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20 });
      let apex = 0;
      for (let i = 0; i < 60; i++) {
        jumper.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20, ...(i === 0 ? { jumpVelocity: 6 } : {}) });
        apex = Math.max(apex, jumper.state().position[1]);
      }
      expect(apex).toBeGreaterThan(0.8);
      expect(apex).toBeLessThan(1.0);
      expect(jumper.state().grounded).toBe(true);

      const platform = backend.addBody({ shape: { kind: "box", halfExtents: [1.5, 0.2, 1.5] }, position: [10, 1, 0], kind: "kinematic" });
      const rider = createCharacterController({ radius: 0.35, height: 1.8, backendMotion: true });
      rider.restore({ ...rider.snapshot(), position: [10, 1.25, 0] });
      for (let i = 0; i < 60; i++) {
        backend.setKinematicTarget(platform, [10 + (i + 1) * 0.02, 1, 0]);
        rider.move(backend, { motion: [0, 0, 0], dt: DT, gravity: 20 });
        backend.step(DT);
      }
      expect(rider.state().groundBody).toBe(platform);
      expect(rider.state().position[0]).toBeGreaterThan(10.8);
      rider.dispose();
      jumper.dispose();
      expect(backend.overlap({ shape: { kind: "sphere", radius: 1 }, position: [rider.state().position[0], 1.2, 0] })).toEqual([platform]);
    } finally { backend.dispose(); }
  });
});
