import { describe, expect, test } from "bun:test";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import {
  createFrustum,
  updateFrustum,
  aabbInFrustum,
  sphereInFrustum,
  dilateFrustum,
} from "@jgengine/core/visibility/frustum";

const perspective: CameraView = {
  kind: "perspective",
  position: [0, 0, 0],
  target: [0, 0, 10],
  fovDeg: 55,
  aspect: 1,
  near: 0.1,
  far: 100,
};

function frustumOf(view: CameraView) {
  return updateFrustum(createFrustum(), view);
}

describe("frustum", () => {
  test("point directly ahead is in view", () => {
    const f = frustumOf(perspective);
    expect(sphereInFrustum(f, 0, 0, 10, 0.5)).toBe(true);
  });

  test("point behind the camera is out of view", () => {
    const f = frustumOf(perspective);
    expect(sphereInFrustum(f, 0, 0, -10, 0.5)).toBe(false);
  });

  test("point far to the side is out of view", () => {
    const f = frustumOf(perspective);
    expect(sphereInFrustum(f, 100, 0, 10, 0.5)).toBe(false);
  });

  test("point beyond the far plane is out of view", () => {
    const f = frustumOf(perspective);
    expect(sphereInFrustum(f, 0, 0, 500, 0.5)).toBe(false);
  });

  test("aabb straddling the edge is kept (conservative)", () => {
    const f = frustumOf(perspective);
    // Centered near the right edge at depth 10; part of the box is inside.
    expect(aabbInFrustum(f, 4, -1, 9, 8, 1, 11)).toBe(true);
  });

  test("aabb fully outside is rejected", () => {
    const f = frustumOf(perspective);
    expect(aabbInFrustum(f, 50, -1, 9, 60, 1, 11)).toBe(false);
  });

  test("orthographic view culls by half extents", () => {
    const ortho: CameraView = {
      kind: "orthographic",
      position: [0, 50, 0],
      target: [0, 0, 0],
      up: [0, 0, -1],
      halfWidth: 10,
      halfHeight: 10,
      near: 0.1,
      far: 100,
    };
    const f = frustumOf(ortho);
    expect(sphereInFrustum(f, 0, 0, 0, 0.5)).toBe(true);
    expect(sphereInFrustum(f, 40, 0, 0, 0.5)).toBe(false);
    expect(sphereInFrustum(f, 0, 0, 40, 0.5)).toBe(false);
  });

  test("dilating a frustum widens what it accepts", () => {
    const f = frustumOf(perspective);
    const wide = dilateFrustum(f, 20, createFrustum());
    // A point just outside the right edge fails the tight test but passes the dilated one.
    const justOutside = sphereInFrustum(f, 9, 0, 10, 0.1);
    expect(justOutside).toBe(false);
    expect(sphereInFrustum(wide, 9, 0, 10, 0.1)).toBe(true);
  });
});
