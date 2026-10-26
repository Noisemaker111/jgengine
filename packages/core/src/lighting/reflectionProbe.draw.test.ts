import { expect, test } from "bun:test";

import * as THREE from "three";

import {
  PROBE_FIRST_WAIT_FRAMES,
  PROBE_MIN_FRAMES,
  PROBE_SETTLE_MS,
  probeDue,
  probeStreamingQuiet,
  firstReflections,
  reflectsWorld,
  worldProbeForQuality,
} from "./reflectionProbe.draw";

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

test("no capture starts while models are still streaming in", () => {
  expect(probeStreamingQuiet(0, true, 10_000)).toBe(false);
  expect(probeStreamingQuiet(PROBE_SETTLE_MS - 1, true, 10_000)).toBe(false);
  expect(probeStreamingQuiet(PROBE_SETTLE_MS, true, 0)).toBe(true);
  expect(probeStreamingQuiet(Number.POSITIVE_INFINITY, false, 0)).toBe(true);
  // A world that never stops streaming still gets its first reflections, eventually.
  expect(probeStreamingQuiet(0, false, PROBE_FIRST_WAIT_FRAMES - 1)).toBe(false);
  expect(probeStreamingQuiet(0, false, PROBE_FIRST_WAIT_FRAMES)).toBe(true);
});

test("a capture links each first reflection on a reflecting copy, leaving the scene's materials untouched", () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const metal = new THREE.MeshStandardMaterial({ metalness: 1 });
  metal.onBeforeCompile = () => {};
  metal.customProgramCacheKey = () => "jg-wet:v1";
  const matte = new THREE.MeshStandardMaterial({ metalness: 0, roughness: 1 });
  const single = new THREE.Mesh(geometry, metal);
  const mixed = new THREE.Mesh(geometry, [matte, metal]);
  scene.add(single, mixed, new THREE.Mesh(geometry, matte));
  const texture = new THREE.Texture();
  const copies = new Map<THREE.Material, THREE.Material>();

  const found = firstReflections(scene, texture, copies);

  expect([...found.keys()]).toEqual([single, mixed]);
  const copy = found.get(single) as THREE.MeshStandardMaterial;
  expect(copy).not.toBe(metal);
  expect(copy.envMap).toBe(texture);
  expect(copy.onBeforeCompile).toBe(metal.onBeforeCompile);
  expect(copy.customProgramCacheKey()).toBe("jg-wet:v1");
  expect(found.get(mixed)).toEqual([matte, copy]);
  expect(metal.envMap).toBeNull();
  expect(firstReflections(scene, texture, copies).get(single), "one copy per material, kept between captures").toBe(copy);

  let copyDisposed = false;
  copy.addEventListener("dispose", () => {
    copyDisposed = true;
  });
  metal.dispose();
  expect(copyDisposed, "the copy's programs live as long as the material they stand for").toBe(true);
  expect(copies.size).toBe(0);
});
