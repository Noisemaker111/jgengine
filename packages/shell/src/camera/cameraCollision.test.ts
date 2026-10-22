import { describe, expect, test } from "bun:test";

import { createSceneRaycast } from "@jgengine/core/scene/sceneRaycast";
import { createWorldSolids } from "@jgengine/core/world/worldSolids";

import {
  CAMERA_TRANSPARENT_USERDATA,
  clearCameraBoom,
  isCameraOccluderTransparent,
  sceneCameraQuery,
  type CameraOccluder,
  type CameraPoint,
} from "./cameraCollision";

function node(userData: Record<string, unknown> | undefined, parent: CameraOccluder | null = null): CameraOccluder {
  return { userData, parent };
}

describe("camera spring-arm occlusion filter", () => {
  test("untagged geometry blocks the camera (unchanged behavior)", () => {
    expect(isCameraOccluderTransparent(node({}))).toBe(false);
    expect(isCameraOccluderTransparent(node(undefined))).toBe(false);
    expect(isCameraOccluderTransparent(null)).toBe(false);
  });

  test("self-tagged decor passes through", () => {
    expect(isCameraOccluderTransparent(node({ jgCameraTransparent: true }))).toBe(true);
  });

  test("the flag is inheritable: a child of a transparent group passes through", () => {
    const decorGroup = node({ jgCameraTransparent: true });
    const mesh = node({}, decorGroup);
    const nested = node(undefined, mesh);
    expect(isCameraOccluderTransparent(mesh)).toBe(true);
    expect(isCameraOccluderTransparent(nested)).toBe(true);
  });

  test("a descendant opts back into blocking with jgCameraCollide (nearest tag wins)", () => {
    const decorGroup = node({ jgCameraTransparent: true });
    const solidChild = node({ jgCameraCollide: true }, decorGroup);
    const solidMesh = node({}, solidChild);
    expect(isCameraOccluderTransparent(solidChild)).toBe(false);
    expect(isCameraOccluderTransparent(solidMesh)).toBe(false);
  });

  test("the exported wrapper userData carries the transparent flag", () => {
    expect(isCameraOccluderTransparent(node(CAMERA_TRANSPARENT_USERDATA))).toBe(true);
  });
});

const NEAR_PLANE = 0.1;
const CLEARANCE = NEAR_PLANE + 0.15;
/** A dead trunk standing at the origin, wider than a first-person body's reach at eye height. */
const TRUNK = { center: [0, 1.5, 0] as const, halfExtents: [0.4, 1.5, 0.4] as const };
const TRUNK_NEAR_FACE = TRUNK.center[2] - TRUNK.halfExtents[2];

function trunkWorld() {
  const solids = createWorldSolids();
  solids.set("test:trunk", [{ center: [...TRUNK.center], halfExtents: [...TRUNK.halfExtents] }]);
  return { solids, query: sceneCameraQuery(createSceneRaycast({ solids }).raycast) };
}

function distanceToTrunkFace(camera: CameraPoint): number {
  return TRUNK_NEAR_FACE - camera.z;
}

describe("camera clearance", () => {
  test("a first-person walk into a trunk stops the camera outside it, near plane still clear", () => {
    const { query } = trunkWorld();
    let arm: number | null = null;
    let camera: CameraPoint = { x: 0, y: 1.5, z: -4 };
    let deepest = Infinity;
    for (let frame = 0; frame < 113; frame += 1) {
      const eyeZ = -4 + frame * 0.04;
      const eye: CameraPoint = { x: 0, y: 1.5, z: eyeZ };
      const pivot: CameraPoint = { x: eye.x, y: eye.y, z: eye.z - 1.5 };
      const cleared = clearCameraBoom({
        pivot,
        desired: eye,
        query,
        clearance: CLEARANCE,
        previousArm: arm,
        deltaSeconds: 1 / 60,
      });
      arm = cleared.arm;
      camera = cleared.position;
      deepest = Math.min(deepest, distanceToTrunkFace(camera));
    }
    expect(deepest).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
    expect(deepest).toBeGreaterThan(NEAR_PLANE);
    expect(camera.z).toBeLessThanOrEqual(TRUNK_NEAR_FACE - CLEARANCE + 1e-6);
  });

  test("a desired position inside world collision is rejected", () => {
    const { query } = trunkWorld();
    const cleared = clearCameraBoom({
      pivot: { x: 0, y: 1.5, z: -2 },
      desired: { x: 0, y: 1.5, z: 0 },
      query,
      clearance: CLEARANCE,
    });
    expect(cleared.pulled).toBe(true);
    expect(cleared.position.z).toBeLessThan(TRUNK_NEAR_FACE);
    expect(distanceToTrunkFace(cleared.position)).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
  });

  test("the boom eases back out once the trunk is gone, so the camera does not snap", () => {
    const { solids, query } = trunkWorld();
    const pulled = clearCameraBoom({
      pivot: { x: 0, y: 1.5, z: -2 },
      desired: { x: 0, y: 1.5, z: 0 },
      query,
      clearance: CLEARANCE,
    });
    expect(pulled.arm).toBeLessThan(2);
    solids.remove("test:trunk");
    const first = clearCameraBoom({
      pivot: { x: 0, y: 1.5, z: -2 },
      desired: { x: 0, y: 1.5, z: 0 },
      query,
      clearance: CLEARANCE,
      previousArm: pulled.arm,
      deltaSeconds: 1 / 60,
    });
    expect(first.pulled).toBe(false);
    expect(first.arm).toBeGreaterThan(pulled.arm);
    expect(first.arm).toBeLessThan(1.99);
    let arm = pulled.arm;
    for (let frame = 0; frame < 90; frame += 1) {
      arm = clearCameraBoom({
        pivot: { x: 0, y: 1.5, z: -2 },
        desired: { x: 0, y: 1.5, z: 0 },
        query,
        clearance: CLEARANCE,
        previousArm: arm,
        deltaSeconds: 1 / 60,
      }).arm;
    }
    expect(arm).toBeCloseTo(2, 2);
  });

  test("the boom stays on the desired point when world collision is clear", () => {
    const { query } = trunkWorld();
    const desired: CameraPoint = { x: 6, y: 1.5, z: -2 };
    const cleared = clearCameraBoom({ pivot: { x: 2, y: 1.5, z: -2 }, desired, query, clearance: CLEARANCE });
    expect(cleared.pulled).toBe(false);
    expect(cleared.position).toEqual(desired);
  });

  test("a boom origin inside the trunk leaves the eye where it is instead of teleporting", () => {
    const { query } = trunkWorld();
    const cleared = clearCameraBoom({
      pivot: { x: 0, y: 1.5, z: 0 },
      desired: { x: 0, y: 1.5, z: 3 },
      query,
      clearance: CLEARANCE,
    });
    expect(cleared.pulled).toBe(false);
    expect(cleared.position).toEqual({ x: 0, y: 1.5, z: 3 });
  });

  test("a third-person boom through the trunk pulls in the same way", () => {
    const { query } = trunkWorld();
    const cleared = clearCameraBoom({
      pivot: { x: 0, y: 3, z: -8 },
      desired: { x: 0, y: 3, z: 0 },
      query,
      clearance: CLEARANCE,
    });
    expect(cleared.pulled).toBe(true);
    expect(cleared.position.z).toBeLessThanOrEqual(TRUNK_NEAR_FACE - CLEARANCE + 1e-6);
  });

  test("a game-owned camera composes with any hit query, not just the scene raycast", () => {
    const cleared = clearCameraBoom({
      pivot: { x: 0, y: 0, z: 0 },
      desired: { x: 0, y: 0, z: -6 },
      query: { firstHit: () => 2 },
      clearance: 0.3,
    });
    expect(cleared.position.z).toBeCloseTo(-1.7, 6);
  });
});
