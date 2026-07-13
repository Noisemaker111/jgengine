import { describe, expect, test } from "bun:test";
import {
  cameraLookPitch,
  compensatedFov,
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

describe("cameraLookPitch", () => {
  test("level camera aims flat", () => {
    expect(cameraLookPitch({ x: 0, y: 2, z: -10 }, { x: 0, y: 2, z: 0 })).toBeCloseTo(0);
  });

  test("camera above target aims down (negative)", () => {
    expect(cameraLookPitch({ x: 0, y: 10, z: -10 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(-Math.PI / 4);
  });

  test("camera below target aims up (positive)", () => {
    expect(cameraLookPitch({ x: 0, y: 0, z: -10 }, { x: 0, y: 10, z: 0 })).toBeCloseTo(Math.PI / 4);
  });

  test("top-down camera aims straight down", () => {
    expect(cameraLookPitch({ x: 0, y: 20, z: 0 }, { x: 0, y: 0, z: 0 })).toBeCloseTo(-Math.PI / 2);
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

describe("resolveOrbitCameraConfig pitchClamp", () => {
  test("maps signed pitch clamp onto polar angles (polar = PI/2 - pitch)", () => {
    const config = resolveOrbitCameraConfig({ pitchClamp: [-0.4, 1.35] });
    expect(config.minPolarAngle).toBeCloseTo(Math.PI / 2 - 1.35);
    expect(config.maxPolarAngle).toBeCloseTo(Math.PI / 2 + 0.4);
  });

  test("explicit polar fields win over pitchClamp", () => {
    const config = resolveOrbitCameraConfig({ pitchClamp: [-0.4, 1.35], minPolarAngle: 0.1, maxPolarAngle: 2 });
    expect(config.minPolarAngle).toBe(0.1);
    expect(config.maxPolarAngle).toBe(2);
  });

  test("unset pitchClamp leaves defaults untouched", () => {
    const config = resolveOrbitCameraConfig({});
    expect(config.minPolarAngle).toBe(DEFAULT_ORBIT_CAMERA.minPolarAngle);
    expect(config.maxPolarAngle).toBe(DEFAULT_ORBIT_CAMERA.maxPolarAngle);
  });
});

describe("seedOrbitFollowState initialYaw/initialPitch", () => {
  test("legacy placement when yaw and pitch unset", () => {
    const state = seedOrbitFollowState({ entityPosition: [0, 0, 0], config: DEFAULT_ORBIT_CAMERA });
    expect(state.camera).toEqual({ x: 0, y: DEFAULT_ORBIT_CAMERA.initialHeight, z: -DEFAULT_ORBIT_CAMERA.initialDistance });
  });

  test("seeds yaw and pitch spherically around the target", () => {
    const config = { ...DEFAULT_ORBIT_CAMERA, initialDistance: 12, initialYaw: Math.PI, initialPitch: 0.32 };
    const state = seedOrbitFollowState({ entityPosition: [0, 0, 0], config });
    expect(distanceBetween(state.camera, state.target)).toBeCloseTo(12);
    expect(orbitYawFromCamera(state.camera.x, state.camera.z, state.target.x, state.target.z)).toBeCloseTo(Math.PI);
    // boom elevation positive => camera above target => look-pitch negative
    expect(cameraLookPitch(state.camera, state.target)).toBeCloseTo(-0.32);
    expect(state.lockedDistance).toBe(12);
  });
});

describe("compensatedFov", () => {
  test("no-op at or beyond desired distance", () => {
    expect(compensatedFov(55, 12, 12)).toBe(55);
    expect(compensatedFov(55, 12, 20)).toBe(55);
  });

  test("widens as the camera pulls in", () => {
    const widened = compensatedFov(55, 12, 6);
    expect(widened).toBeGreaterThan(55);
    // halving distance doubles the tangent of the half-angle
    expect(Math.tan((widened * Math.PI) / 360)).toBeCloseTo(2 * Math.tan((55 * Math.PI) / 360));
  });

  test("clamps to a projection-safe maximum", () => {
    expect(compensatedFov(90, 100, 0.01)).toBeLessThanOrEqual(170);
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