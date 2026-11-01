import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createAmbientFauna } from "./ambientFauna";
import { createFaunaView, selectVisible, sphereInView, writeFaunaView, type FaunaSelection } from "./faunaCull";

function viewLooking(from: [number, number, number], at: [number, number, number]) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(...from);
  camera.lookAt(...at);
  camera.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const view = createFaunaView();
  writeFaunaView(view, matrix.elements, from[0], from[1], from[2]);
  return view;
}

describe("faunaCull", () => {
  test("a sphere ahead is in view, one behind is not", () => {
    const view = viewLooking([0, 0, 0], [0, 0, -10]);
    expect(sphereInView(view, 0, 0, -20, 1)).toBe(true);
    expect(sphereInView(view, 0, 0, 20, 1)).toBe(false);
    expect(sphereInView(view, 200, 0, -5, 1)).toBe(false);
  });

  test("agents split by distance into model and sprite lists, bounded by the budget", () => {
    const fauna = createAmbientFauna([{ id: "g", species: "x", motion: "drift", area: { shape: "disc", x: 0, z: -60, radius: 80 }, count: 300, lod: { near: 40, far: 100 }, budget: 120 }], {});
    fauna.update({ dt: 0.01, time: 0, sunHeight: 1, focusX: 0, focusZ: 0 });
    const state = fauna.groups[0]!;
    const view = viewLooking([0, 2, 0], [0, 2, -60]);
    const near = new Int32Array(300);
    const far = new Int32Array(300);
    const out: FaunaSelection = { near: 0, far: 0 };
    const distance = (index: number): number => Math.hypot(state.position[index * 3]!, state.position[index * 3 + 1]! - 2, state.position[index * 3 + 2]!);
    selectVisible(state, view, 0.5, 1e9, near, far, out);
    expect(out.near + out.far).toBeLessThanOrEqual(120);
    expect(out.near + out.far).toBeGreaterThan(0);
    for (let k = 0; k < out.near; k += 1) expect(distance(near[k]!)).toBeLessThanOrEqual(40 + 1e-3);
    for (let k = 0; k < out.far; k += 1) expect(distance(far[k]!)).toBeGreaterThan(40);
    selectVisible(state, view, 0.5, 7, near, far, out);
    expect(out.near + out.far).toBe(7);
  });
});
