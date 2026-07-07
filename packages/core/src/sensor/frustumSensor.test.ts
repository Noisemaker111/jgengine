import { describe, expect, test } from "bun:test";
import {
  createFrustumSensor,
  framingScore,
  projectToView,
  type FrustumCamera,
} from "@jgengine/core/sensor/frustumSensor";

const CAMERA: FrustumCamera = { position: [0, 0, 0], lookAt: [0, 0, 1], fovDeg: 60, aspect: 16 / 9 };

describe("projectToView", () => {
  test("a point straight ahead projects to screen center and is in view", () => {
    const projection = projectToView(CAMERA, [0, 0, 5]);
    expect(projection.inView).toBe(true);
    expect(projection.screenX).toBeCloseTo(0, 5);
    expect(projection.screenY).toBeCloseTo(0, 5);
    expect(projection.distance).toBe(5);
  });

  test("a point behind the camera is never in view", () => {
    const projection = projectToView(CAMERA, [0, 0, -5]);
    expect(projection.inView).toBe(false);
  });

  test("a point far outside the horizontal fov is out of view", () => {
    const projection = projectToView(CAMERA, [50, 0, 5]);
    expect(projection.inView).toBe(false);
    expect(Math.abs(projection.screenX)).toBeGreaterThan(1);
  });

  test("a point beyond far or inside near clips out", () => {
    const capped: FrustumCamera = { ...CAMERA, near: 1, far: 10 };
    expect(projectToView(capped, [0, 0, 0.5]).inView).toBe(false);
    expect(projectToView(capped, [0, 0, 20]).inView).toBe(false);
    expect(projectToView(capped, [0, 0, 5]).inView).toBe(true);
  });
});

describe("framingScore", () => {
  test("scores 0 when not in view", () => {
    expect(framingScore({ inView: false, distance: 5, screenX: 0, screenY: 0 })).toBe(0);
  });

  test("dead-center at ideal distance scores highest", () => {
    const centered = framingScore({ inView: true, distance: 6, screenX: 0, screenY: 0 }, { idealDistance: 6 });
    const offCenter = framingScore({ inView: true, distance: 6, screenX: 0.8, screenY: 0 }, { idealDistance: 6 });
    expect(centered).toBeCloseTo(1, 5);
    expect(offCenter).toBeLessThan(centered);
  });

  test("distance far from ideal lowers the size component", () => {
    const near = framingScore({ inView: true, distance: 6, screenX: 0, screenY: 0 }, { idealDistance: 6 });
    const tooClose = framingScore({ inView: true, distance: 0.5, screenX: 0, screenY: 0 }, { idealDistance: 6 });
    expect(tooClose).toBeLessThan(near);
  });
});

describe("createFrustumSensor", () => {
  test("accumulates dwell time while a target stays in view", () => {
    const sensor = createFrustumSensor();
    const target = { id: "monster", position: [0, 0, 5] as const };
    const first = sensor.tick(CAMERA, [target], 0.5);
    const second = sensor.tick(CAMERA, [target], 0.5);
    expect(first[0]!.inView).toBe(true);
    expect(first[0]!.dwellSeconds).toBeCloseTo(0.5, 5);
    expect(second[0]!.dwellSeconds).toBeCloseTo(1, 5);
  });

  test("dwell resets the instant a target leaves view", () => {
    const sensor = createFrustumSensor();
    const inView = { id: "monster", position: [0, 0, 5] as const };
    const outOfView = { id: "monster", position: [0, 0, -5] as const };
    sensor.tick(CAMERA, [inView], 1);
    const after = sensor.tick(CAMERA, [outOfView], 1);
    expect(after[0]!.inView).toBe(false);
    expect(after[0]!.dwellSeconds).toBe(0);
  });

  test("framing quality is included per sample", () => {
    const sensor = createFrustumSensor({ idealDistance: 5 });
    const samples = sensor.tick(CAMERA, [{ id: "subject", position: [0, 0, 5] }], 0.1);
    expect(samples[0]!.framing).toBeGreaterThan(0.9);
  });

  test("reset clears dwell state for one id or all", () => {
    const sensor = createFrustumSensor();
    const target = { id: "monster", position: [0, 0, 5] as const };
    sensor.tick(CAMERA, [target], 2);
    sensor.reset("monster");
    const after = sensor.tick(CAMERA, [target], 0.25);
    expect(after[0]!.dwellSeconds).toBeCloseTo(0.25, 5);
  });
});
