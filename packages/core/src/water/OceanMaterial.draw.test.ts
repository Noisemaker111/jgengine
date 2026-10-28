import { expect, test } from "bun:test";
import * as THREE from "three";

import { createSkyLight } from "@jgengine/core/sky/skyLight.draw";
import { runToEnd } from "@jgengine/core/run/slicedWork";
import { createOceanConfig } from "./OceanConfig.draw";
import { createOceanMaterial, syncOceanMaterial } from "./OceanMaterial.draw";
import { bakeOceanBed, createFollowGeometry } from "./Ocean.draw";
import { oceanBedBounds } from "./oceanBed";

const config = createOceanConfig({ color: { sparkle: 0.5 } });

function lightWithSun(direction: readonly [number, number, number]) {
  const light = createSkyLight();
  light.sunDirection.set(direction[0], direction[1], direction[2]).normalize();
  return light;
}

test("glints follow the sky's sun and keep full strength while it is up", () => {
  const material = createOceanMaterial(config);
  syncOceanMaterial(material, config, 3, lightWithSun([0, 10, -10]));
  const sun = material.uniforms.uSunDirection.value;
  expect(sun.length()).toBeCloseTo(1, 6);
  expect(sun.y).toBeCloseTo(Math.SQRT1_2, 6);
  expect(sun.z).toBeCloseTo(-Math.SQRT1_2, 6);
  expect(material.uniforms.uSparkle.value).toBeCloseTo(0.5, 6);
  expect(material.uniforms.uTime.value).toBe(3);
});

test("a set sun leaves a night sea without glints, and a low sun dims them", () => {
  const material = createOceanMaterial(config);
  syncOceanMaterial(material, config, 0, lightWithSun([0, -0.4, 1]));
  expect(material.uniforms.uSparkle.value).toBe(0);
  syncOceanMaterial(material, config, 0, lightWithSun([0, 0.05, 1]));
  expect(material.uniforms.uSparkle.value).toBeGreaterThan(0);
  expect(material.uniforms.uSparkle.value).toBeLessThan(0.5);
});

test("the water takes the sky's light, colours and cover; without a sky it keeps a clear noon", () => {
  const material = createOceanMaterial(config);
  const night = createSkyLight();
  night.sun.setRGB(0, 0, 0);
  night.ambient.setRGB(0.02, 0.02, 0.04);
  night.zenith.setRGB(0.001, 0.002, 0.01);
  night.horizon.setRGB(0.01, 0.01, 0.02);
  night.cloudCover = 0.7;
  syncOceanMaterial(material, config, 0, night);
  expect(material.uniforms.uSun.value.r).toBe(0);
  expect(material.uniforms.uAmbient.value.b).toBeCloseTo(0.04);
  expect(material.uniforms.uHorizon.value.r).toBeCloseTo(0.01);
  expect(material.uniforms.uCover.value).toBeCloseTo(0.7);
  syncOceanMaterial(material, config, 0);
  expect(material.uniforms.uSunDirection.value.y).toBeGreaterThan(0.5);
  expect(material.uniforms.uSun.value.r).toBeGreaterThan(1);
  expect(material.uniforms.uSparkle.value).toBeCloseTo(0.5, 6);
});

test("a fog-aware blended material that still writes depth, so post passes see the sea as a surface", () => {
  const material = createOceanMaterial(config);
  expect(material.fog).toBe(true);
  expect(material.transparent).toBe(true);
  expect(material.depthWrite).toBe(true);
  expect(material.uniforms).toHaveProperty("fogColor");
});

function texel(texture: THREE.DataTexture, index: number): number | undefined {
  const data: unknown = texture.image.data;
  if (!(data instanceof Uint16Array)) return undefined;
  const value = data[index];
  return value === undefined ? undefined : THREE.DataUtils.fromHalfFloat(value);
}

test("the bed bakes to a half-float height map, one row per slice, sampled at texel centres", () => {
  const job = bakeOceanBed((x, z) => x * 0.5 - z, [-4, -4, 4, 4], 4);
  let slices = 0;
  let step = job.next();
  while (step.done !== true) {
    slices += 1;
    step = job.next();
  }
  expect(slices).toBe(4);
  const texture = step.value;
  expect(texture.type).toBe(THREE.HalfFloatType);
  // texel (column 0, row 0) centre is (-3, -3): -1.5 + 3
  expect(texel(texture, 0)).toBeCloseTo(1.5, 2);
  // texel (column 3, row 3) centre is (3, 3): 1.5 - 3
  expect(texel(texture, 15)).toBeCloseTo(-1.5, 2);
  const nonFinite = runToEnd(bakeOceanBed(() => Number.NaN, [0, 0, 1, 1], 1));
  expect(texel(nonFinite, 0)).toBe(-1000);
});

test("the follow grid packs vertices near the camera and still reaches its edge", () => {
  const { geometry, spacing } = createFollowGeometry(2400, 256);
  const positions = geometry.getAttribute("position");
  let maxX = 0;
  let nearestNonZero = Infinity;
  for (let i = 0; i < positions.count; i += 1) {
    const x = Math.abs(positions.getX(i));
    maxX = Math.max(maxX, x);
    if (x > 1e-6) nearestNonZero = Math.min(nearestNonZero, x);
  }
  expect(maxX).toBeCloseTo(2400, 3);
  expect(nearestNonZero).toBeLessThan(1.5);
  expect(spacing).toBeCloseTo(nearestNonZero, 1);
});

test("the bed is baked only where the terrain is, in the sheet's local space", () => {
  expect(oceanBedBounds({ bounds: { w: 5280, d: 5280 } }, { w: 3300, d: 3300 })).toEqual([-1650, -1650, 1650, 1650]);
  expect(oceanBedBounds({ bounds: { w: 100, d: 60 }, position: [500, 0] }, undefined)).toEqual([-50, -30, 50, 30]);
  expect(oceanBedBounds({ bounds: { w: 200, d: 200 }, position: [50, 0] }, { w: 200, d: 200 })).toEqual([-100, -100, 50, 100]);
});
