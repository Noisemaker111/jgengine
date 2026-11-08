import { expect, test } from "bun:test";

import * as THREE from "three";

import { acquireImpostor, hemiOctDecode, hemiOctEncode, impostorDistance, impostorSettingsForQuality, impostorSwitch, impostorUp, releaseImpostor } from "./impostor.draw";

/** A renderer that only counts the bake's draws: enough to see whether a bake happened. */
function countingRenderer(): { renderer: THREE.WebGLRenderer; draws: () => number } {
  let draws = 0;
  const known: Record<string, unknown> = {
    shadowMap: { autoUpdate: true },
    autoClear: true,
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    getRenderTarget: () => null,
    render: () => {
      draws += 1;
    },
  };
  const renderer = new Proxy(known, { get: (target, name) => (typeof name === "string" && name in target ? target[name] : () => undefined) });
  return { renderer: renderer as unknown as THREE.WebGLRenderer, draws: () => draws };
}

test("an impostor whose batches all leave is kept for the next one, and freed once its model is disposed", () => {
  const { renderer, draws } = countingRenderer();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const sources = [{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() }];
  const settings = { frames: 2, cell: 8 };
  const first = acquireImpostor("kept-tree", renderer, sources, settings);
  const baked = draws();
  expect(baked).toBeGreaterThan(0);
  releaseImpostor("kept-tree", renderer, settings);
  // A grove burnt down and regrown long after: the same bake, no draws, links or render targets.
  expect(acquireImpostor("kept-tree", renderer, sources, settings)).toBe(first);
  expect(draws()).toBe(baked);

  let freed = false;
  first.materials?.material.addEventListener("dispose", () => {
    freed = true;
  });
  geometry.dispose();
  expect(freed, "a model disposed while a batch still draws its impostor keeps it until that batch goes").toBe(false);
  releaseImpostor("kept-tree", renderer, settings);
  expect(freed).toBe(true);
  expect(acquireImpostor("kept-tree", renderer, sources, settings)).not.toBe(first);
  expect(draws()).toBeGreaterThan(baked);
  releaseImpostor("kept-tree", renderer, settings);
});

test("a remounted canvas bakes its own impostor, and the old renderer's unused bake is freed", () => {
  // The atlas is a render target of the context that baked it; Beacon Bastion's far trees vanished
  // after a renderer switch because the new canvas drew the old, lost context's atlas.
  const old = countingRenderer();
  const fresh = countingRenderer();
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const sources = [{ geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4() }];
  const settings = { frames: 2, cell: 8 };
  const first = acquireImpostor("remounted-tree", old.renderer, sources, settings);
  let freed = false;
  first.materials?.material.addEventListener("dispose", () => {
    freed = true;
  });
  releaseImpostor("remounted-tree", old.renderer, settings);
  const second = acquireImpostor("remounted-tree", fresh.renderer, sources, settings);
  expect(second).not.toBe(first);
  expect(fresh.draws()).toBeGreaterThan(0);
  expect(freed).toBe(true);
  releaseImpostor("remounted-tree", fresh.renderer, settings);
});

test("hemi-octahedral directions round-trip for every view above the horizon", () => {
  const out = new THREE.Vector3();
  for (const [x, y, z] of [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0.6, 0.3, -0.74], [-0.2, 0.9, 0.39]] as const) {
    const direction = new THREE.Vector3(x, y, z).normalize();
    const [u, v] = hemiOctEncode(direction.x, direction.y, direction.z);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    expect(hemiOctDecode(u, v, out).distanceTo(direction)).toBeLessThan(1e-6);
  }
});

test("views from below the horizon fold onto the horizon frame", () => {
  const [u, v] = hemiOctEncode(1, -0.5, 0);
  const decoded = hemiOctDecode(u, v);
  expect(decoded.y).toBeCloseTo(0, 6);
  expect(decoded.x).toBeCloseTo(1, 6);
});

test("the bake camera's up vector stays defined looking straight down", () => {
  expect(impostorUp(new THREE.Vector3(0, 1, 0)).toArray()).toEqual([0, 0, -1]);
  expect(impostorUp(new THREE.Vector3(1, 0, 0)).toArray()).toEqual([0, 1, 0]);
});

test("the swap happens farther out on higher tiers and for bigger models", () => {
  expect(impostorDistance(3, "low")).toBeLessThan(impostorDistance(3, "high"));
  expect(impostorDistance(3, "high")).toBeLessThan(impostorDistance(3, "ultra"));
  expect(impostorDistance(12, "high")).toBeGreaterThan(impostorDistance(3, "high"));
  expect(impostorSettingsForQuality("low").cell).toBeLessThan(impostorSettingsForQuality("ultra").cell);
});

test("the near/far switch holds a band so a prop at the threshold does not flicker", () => {
  const threshold = 70;
  expect(impostorSwitch(threshold + 1, threshold, false)).toBe(false);
  expect(impostorSwitch(threshold + 10, threshold, false)).toBe(true);
  expect(impostorSwitch(threshold - 1, threshold, true)).toBe(true);
  expect(impostorSwitch(threshold - 10, threshold, true)).toBe(false);
});
