import { expect, test } from "bun:test";

import * as THREE from "three";

import { PROBE_MIN_FRAMES, probeDue, reflectsWorld, worldProbeForQuality } from "./worldReflectionProbe";

test("low keeps the procedural probe; higher tiers capture sharper and more often", () => {
  expect(worldProbeForQuality("low")).toBeNull();
  const medium = worldProbeForQuality("medium")!;
  const high = worldProbeForQuality("high")!;
  const ultra = worldProbeForQuality("ultra")!;
  expect(medium.size).toBeLessThan(high.size);
  expect(high.size).toBeLessThan(ultra.size);
  expect(ultra.interval).toBeLessThan(medium.interval);
});

test("a capture is due first, after the interval, or after the camera travels", () => {
  const settings = { size: 128, interval: 4, moveDistance: 25 };
  const origin = { x: 0, y: 0, z: 0 };
  expect(probeDue(null, origin, 0, settings)).toBe(true);
  expect(probeDue(origin, { x: 10, y: 0, z: 0 }, 1, settings)).toBe(false);
  expect(probeDue(origin, { x: 30, y: 0, z: 0 }, 1, settings)).toBe(true);
  expect(probeDue(origin, origin, 4, settings)).toBe(true);
});

test("only metal, glossy and transmissive materials without their own map reflect the world", () => {
  expect(reflectsWorld(new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.6 }))).toBe(true);
  expect(reflectsWorld(new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.2 }))).toBe(true);
  expect(reflectsWorld(new THREE.MeshPhysicalMaterial({ roughness: 0.8, transmission: 1 }))).toBe(true);
  expect(reflectsWorld(new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.8 }))).toBe(false);
  expect(reflectsWorld(new THREE.MeshStandardMaterial({ metalness: 1, envMap: new THREE.Texture() }))).toBe(false);
  expect(reflectsWorld(new THREE.MeshLambertMaterial())).toBe(false);
});

test("a recapture waits for the frame floor, so a slow machine is not refreshing reflections every few frames", () => {
  const settings = { size: 128, interval: 4, moveDistance: 25 };
  const origin = { x: 0, y: 0, z: 0 };
  expect(probeDue(null, origin, 0, settings, 0)).toBe(true);
  expect(probeDue(origin, origin, 60, settings, PROBE_MIN_FRAMES - 1)).toBe(false);
  expect(probeDue(origin, { x: 100, y: 0, z: 0 }, 60, settings, 10)).toBe(false);
  expect(probeDue(origin, origin, 60, settings, PROBE_MIN_FRAMES)).toBe(true);
});
