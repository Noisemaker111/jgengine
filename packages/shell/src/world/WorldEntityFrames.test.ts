import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { projectWorldToScreen } from "./WorldEntityFrames";

/** A camera at +Z looking down -Z (the R3F default orientation). */
function frontCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe("projectWorldToScreen", () => {
  const v = new THREE.Vector3();

  test("projects a point in front of the camera to inside the viewport", () => {
    const camera = frontCamera();
    const p = projectWorldToScreen(v, camera, [0, 0, 0], 800, 600);
    expect(p.behind).toBe(false);
    // Dead-ahead point lands near the viewport center.
    expect(p.x).toBeCloseTo(400, 0);
    expect(p.y).toBeCloseTo(300, 0);
  });

  test("flags points behind the camera so callers cull them", () => {
    const camera = frontCamera();
    // Behind the camera (camera at z=10 looking toward -z; z=20 is behind it).
    const p = projectWorldToScreen(v, camera, [0, 0, 20], 800, 600);
    expect(p.behind).toBe(true);
  });

  test("maps a right-of-center world point to a larger screen x", () => {
    const camera = frontCamera();
    const center = projectWorldToScreen(v, camera, [0, 0, 0], 800, 600);
    const right = projectWorldToScreen(v, camera, [3, 0, 0], 800, 600);
    expect(right.x).toBeGreaterThan(center.x);
  });

  test("nearer points report a smaller depth than farther ones", () => {
    const camera = frontCamera();
    const near = projectWorldToScreen(v, camera, [0, 0, 5], 800, 600); // 5 units from camera
    const far = projectWorldToScreen(v, camera, [0, 0, -5], 800, 600); // 15 units from camera
    expect(near.depth).toBeLessThan(far.depth);
  });
});
