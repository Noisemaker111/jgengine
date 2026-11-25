import { expect, test } from "bun:test";

import { diffSceneView, frameSceneView, panSceneView, sceneViewBounds, sceneViewEye, sceneViewObjects } from "./sceneView";

const wall = { id: "wall", kind: "wall", shape: "box" as const, center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 2, y: 1, z: 3 } };
const gutter = { id: "gutter", kind: "gutter", points: [{ x: -2, y: 2, z: 3 }, { x: 2, y: 2, z: 3 }] };

test("a diff redraws only objects whose value is a new reference, and drops hidden ones", () => {
  const before = sceneViewObjects({ volumes: [wall], paths: [gutter] });
  const moved = { ...wall, center: { x: 1, y: 1, z: 0 } };
  const after = sceneViewObjects({ volumes: [moved, { ...wall, id: "shed" }], paths: [{ ...gutter, hidden: true }] });
  const diff = diffSceneView(before, after);
  expect(diff.changed.map((object) => object.value.id)).toEqual(["wall"]);
  expect(diff.added.map((object) => object.value.id)).toEqual(["shed"]);
  expect(diff.removed).toEqual(["gutter"]);
  expect(diffSceneView(after, sceneViewObjects({ volumes: [moved, after.get("shed")!.value as typeof wall] }))).toEqual({ added: [], changed: [], removed: [] });
});

test("the framed camera sees the whole document", () => {
  const bounds = sceneViewBounds(sceneViewObjects({ volumes: [wall], paths: [gutter] }).values());
  expect(bounds).toEqual({ min: { x: -2, y: 0, z: -3 }, max: { x: 2, y: 2, z: 3 } });
  const camera = frameSceneView(bounds, 45, 377 / 700);
  const eye = sceneViewEye(camera);
  const forward = { x: camera.target.x - eye.x, y: camera.target.y - eye.y, z: camera.target.z - eye.z };
  const length = Math.hypot(forward.x, forward.y, forward.z);
  const tanY = Math.tan((45 * Math.PI) / 360);
  const tanX = tanY * (377 / 700);
  const right = { x: Math.cos(camera.yaw), z: -Math.sin(camera.yaw) };
  for (const x of [-2, 2]) for (const y of [0, 2]) for (const z of [-3, 3]) {
    const offset = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
    const depth = (offset.x * forward.x + offset.y * forward.y + offset.z * forward.z) / length;
    const across = offset.x * right.x + offset.z * right.z;
    const vertical = Math.sqrt(Math.max(0, offset.x ** 2 + offset.y ** 2 + offset.z ** 2 - depth ** 2 - across ** 2));
    expect(Math.abs(across) / depth).toBeLessThanOrEqual(tanX);
    expect(vertical / depth).toBeLessThanOrEqual(tanY);
  }
});

test("panning keeps the eye-to-target offset and moves both", () => {
  const camera = { target: { x: 0, y: 0, z: 0 }, distance: 10, yaw: 0.3, pitch: 0.4 };
  const panned = panSceneView(camera, 40, -25, 700);
  const before = sceneViewEye(camera);
  const after = sceneViewEye(panned);
  expect(after.x - panned.target.x).toBeCloseTo(before.x - camera.target.x);
  expect(after.y - panned.target.y).toBeCloseTo(before.y - camera.target.y);
  expect(panned.target).not.toEqual(camera.target);
});
