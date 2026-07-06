import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ORBIT_CAMERA,
  distanceBetween,
  orbitFollowStep,
  orbitYawFromCamera,
  resolveFollowTargetFromPosition,
  resolveOrbitCameraConfig,
  resolveTargetSmoothing,
  seedOrbitFollowState,
  smoothBlend,
} from "./orbitCameraMath";

describe("orbitYawFromCamera", () => {
  test("camera south of target yields forward +Z", () => {
    expect(orbitYawFromCamera(0, -10, 0, 0)).toBeCloseTo(0);
  });

  test("camera west of target yields forward +X", () => {
    expect(orbitYawFromCamera(-10, 0, 0, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe("resolveOrbitCameraConfig", () => {
  test("merges patch over defaults", () => {
    const config = resolveOrbitCameraConfig({ minDistance: 2, rotateSpeed: 0.5 });
    expect(config.minDistance).toBe(2);
    expect(config.rotateSpeed).toBe(0.5);
    expect(config.targetSmoothing).toBe(DEFAULT_ORBIT_CAMERA.targetSmoothing);
  });
});

describe("resolveFollowTargetFromPosition", () => {
  test("applies target height and offset", () => {
    expect(
      resolveFollowTargetFromPosition([4, 0, 8], {
        targetHeight: 1.2,
        targetOffset: { x: 1, y: 0.5, z: -2 },
      }),
    ).toEqual({ x: 5, y: 1.7, z: 6 });
  });
});

describe("orbitFollowStep", () => {
  test("carries camera when smoothed target moves (OrbitControls pitfall)", () => {
    const stepped = orbitFollowStep({
      state: {
        target: { x: 0, y: 1, z: 0 },
        camera: { x: 0, y: 5, z: -10 },
        lockedDistance: 10,
      },
      desiredTarget: { x: 4, y: 1, z: 0 },
      deltaSeconds: 1,
      config: { ...DEFAULT_ORBIT_CAMERA, targetSmoothing: 1000, distanceSmoothing: 1000 },
      dragging: false,
    });
    expect(stepped.target.x).toBeCloseTo(4);
    expect(stepped.camera.x).toBeCloseTo(4);
    expect(stepped.distance).toBeCloseTo(10);
  });

  test("tracks a moving entity over multiple frames", () => {
    let state = seedOrbitFollowState({
      entityPosition: [0, 0, 0],
      config: DEFAULT_ORBIT_CAMERA,
    });

    for (let frame = 0; frame < 90; frame += 1) {
      const stepped = orbitFollowStep({
        state,
        desiredTarget: { x: 12, y: DEFAULT_ORBIT_CAMERA.targetHeight, z: 4 },
        deltaSeconds: 1 / 60,
        config: DEFAULT_ORBIT_CAMERA,
        dragging: false,
      });
      state = {
        target: stepped.target,
        camera: stepped.camera,
        lockedDistance: stepped.lockedDistance,
      };
    }

    expect(state.target.x).toBeGreaterThan(10);
    expect(state.camera.x).toBeGreaterThan(10);
    expect(distanceBetween(state.camera, state.target)).toBeCloseTo(state.lockedDistance ?? 0, 1);
  });

  test("does not chase entity when followEnabled is false", () => {
    const stepped = orbitFollowStep({
      state: {
        target: { x: 0, y: 1, z: 0 },
        camera: { x: 0, y: 5, z: -10 },
        lockedDistance: 10,
      },
      desiredTarget: { x: 20, y: 1, z: 0 },
      deltaSeconds: 1 / 60,
      config: { ...DEFAULT_ORBIT_CAMERA, followEnabled: false },
      dragging: false,
    });
    expect(stepped.target.x).toBeCloseTo(0);
    expect(stepped.camera.x).toBeCloseTo(0);
  });

  test("uses faster smoothing while dragging", () => {
    expect(resolveTargetSmoothing(DEFAULT_ORBIT_CAMERA, true)).toBe(11);
    expect(resolveTargetSmoothing(DEFAULT_ORBIT_CAMERA, false)).toBe(8);
  });
});

describe("smoothBlend", () => {
  test("approaches 1 for large delta * speed", () => {
    expect(smoothBlend(1, 10)).toBeGreaterThan(0.9999);
  });

  test("is frame-rate independent at fixed speed", () => {
    const twoHalfFrames = smoothBlend(0.5 / 60, 8) + (1 - smoothBlend(0.5 / 60, 8)) * smoothBlend(0.5 / 60, 8);
    const oneFrame = smoothBlend(1 / 60, 8);
    expect(twoHalfFrames).toBeCloseTo(oneFrame, 5);
  });
});