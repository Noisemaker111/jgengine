import { expect, test } from "bun:test";

import * as THREE from "three";

import { hemiOctDecode, hemiOctEncode, impostorDistance, impostorSettingsForQuality, impostorSwitch, impostorUp } from "./impostor.draw";

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
